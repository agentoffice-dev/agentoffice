using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Events;
using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public class AgentTaskService(
    AppDbContext db,
    IEventPublisher events,
    IAgentIdentity agentIdentity,
    IAgentDirectory agents,
    IChatService chat,
    IDataProtectionProvider protectionProvider) : IAgentTaskService
{
    private readonly IDataProtector _secrets = protectionProvider.CreateProtector("AgentOffice.ResourceSecrets.v1");

    public async Task<AgentTaskDto?> CreateAsync(Guid workspaceId, Guid? documentId, Guid userId, string prompt, Guid? agentId = null)
    {
        var isMember = await db.WorkspaceUsers.AnyAsync(member =>
            member.WorkspaceId == workspaceId && member.UserId == userId);
        var documentExists = documentId is null || await db.Documents.AnyAsync(document =>
            document.Id == documentId && document.WorkspaceId == workspaceId);
        if (!isMember || !documentExists) return null;

        await agentIdentity.EnsureMemberAsync(workspaceId);

        // An unknown or foreign agent id would silently pin the task to nothing; fall
        // back to the workspace default instead, which is what an untagged task uses.
        var agent = agentId is null ? null : await agents.FindAsync(workspaceId, agentId.Value);
        var task = new AgentTask
        {
            WorkspaceId = workspaceId,
            DocumentId = documentId,
            RequestedById = userId,
            AgentId = agent?.Id,
            Prompt = prompt.Trim(),
        };
        db.AgentTasks.Add(task);
        await db.SaveChangesAsync();
        var dto = ToDto(task, agent);
        await events.PublishAsync(new AgentTaskCreatedEvent(dto));
        return dto;
    }

    public async Task<IReadOnlyList<AgentTaskDto>?> ListAsync(Guid workspaceId, Guid userId, int take)
    {
        if (!await db.WorkspaceUsers.AnyAsync(member => member.WorkspaceId == workspaceId && member.UserId == userId))
            return null;

        var result = await db.AgentTasks
            .Where(task => task.WorkspaceId == workspaceId)
            .Include(task => task.Agent)
            .OrderByDescending(task => task.CreatedAt)
            .Take(Math.Clamp(take, 1, 100))
            .ToListAsync();
        return result.Select(task => ToDto(task, task.Agent)).ToList();
    }

    public async Task<AgentTaskDto?> ClaimAsync(string workerId)
    {
        var task = await db.AgentTasks
            .Where(candidate => candidate.Status == AgentTaskStatus.Queued)
            .OrderBy(candidate => candidate.CreatedAt)
            .FirstOrDefaultAsync();
        if (task is null) return null;

        task.Status = AgentTaskStatus.Running;
        task.WorkerId = workerId;
        task.ClaimedAt = task.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var dto = await ToDtoAsync(task);
        await events.PublishAsync(new AgentTaskUpdatedEvent(dto));
        return dto;
    }

    public async Task<AgentTaskContextDto?> GetContextAsync(Guid taskId)
    {
        var task = await db.AgentTasks.FirstOrDefaultAsync(candidate => candidate.Id == taskId);
        if (task is null) return null;
        var document = task.DocumentId is Guid documentId
            ? await db.Documents.FirstOrDefaultAsync(candidate => candidate.Id == documentId)
            : null;
        if (task.DocumentId is not null && document is null) return null;

        // The tagged agent runs the task. Tasks created before mentions — and any whose
        // agent was deleted since — fall back to the oldest enabled agent of the workspace.
        var agent = await db.Agents
            .Include(candidate => candidate.Skills).ThenInclude(link => link.Skill)
            .Where(candidate => candidate.WorkspaceId == task.WorkspaceId && candidate.Enabled)
            .Where(candidate => task.AgentId == null || candidate.Id == task.AgentId)
            .OrderBy(candidate => candidate.CreatedAt)
            .FirstOrDefaultAsync()
            ?? await db.Agents
                .Include(candidate => candidate.Skills).ThenInclude(link => link.Skill)
                .Where(candidate => candidate.WorkspaceId == task.WorkspaceId && candidate.Enabled)
                .OrderBy(candidate => candidate.CreatedAt)
                .FirstOrDefaultAsync();

        var history = await db.ChatMessages
            .Where(message => message.WorkspaceId == task.WorkspaceId)
            .OrderByDescending(message => message.CreatedAt)
            .Take(20)
            .Select(message => new AgentChatTurnDto(message.Sender.Username, message.Content, message.CreatedAt))
            .ToListAsync();
        history.Reverse();

        var skills = agent is null
            ? []
            : agent.Skills.Select(link => link.Skill).Where(skill => skill.Enabled)
                .Select(skill => new AgentSkillDto(skill.Name, skill.Description, skill.Version, skill.Instructions))
                .ToList();

        return new AgentTaskContextDto(
            ToDto(task, agent),
            document is null ? null : new AgentDocumentDto(document.Id, document.FileName, document.ContentType, document.Version),
            agent is null ? null : new AgentProfileDto(
                agent.Id, agent.Name, agent.Provider, agent.Model, agent.SystemPrompt, agent.MaxTurns,
                agent.TimeoutSeconds, agent.PermissionMode, agent.AuthMode,
                Unprotect(agent.ApiKeyEncrypted), Unprotect(agent.OAuthTokenEncrypted),
                agent.ReasoningEffort, agent.SandboxMode, agent.ApprovalPolicy),
            skills,
            history);
    }

    public async Task<AgentTaskEventDto?> AppendEventAsync(Guid taskId, string type, string payloadJson)
    {
        var task = await db.AgentTasks.FindAsync(taskId);
        if (task is null) return null;
        var agentEvent = new AgentTaskEvent { AgentTaskId = taskId, Type = type, PayloadJson = payloadJson };
        db.AgentTaskEvents.Add(agentEvent);
        task.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var dto = new AgentTaskEventDto(agentEvent.Id, taskId, type, payloadJson, agentEvent.CreatedAt);
        await events.PublishAsync(new AgentTaskEventCreatedEvent(task.WorkspaceId, dto));
        return dto;
    }

    public async Task<AgentTaskDto?> FinishAsync(Guid taskId, bool succeeded, string? error)
    {
        var task = await db.AgentTasks.FindAsync(taskId);
        if (task is null) return null;
        task.Status = succeeded ? AgentTaskStatus.Completed : AgentTaskStatus.Failed;
        task.Error = error;
        task.CompletedAt = task.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var dto = await ToDtoAsync(task);
        await events.PublishAsync(new AgentTaskUpdatedEvent(dto));
        return dto;
    }

    public async Task<ChatMessageDto?> PostMessageAsync(Guid taskId, string content)
    {
        var task = await db.AgentTasks.FindAsync(taskId);
        if (task is null) return null;
        var agent = await agentIdentity.EnsureMemberAsync(task.WorkspaceId);
        if (agent is null) return null;
        return await chat.SendAsync(task.WorkspaceId, agent.Id, content, task.DocumentId, task.Id);
    }

    private string? Unprotect(string? protectedValue)
    {
        if (string.IsNullOrWhiteSpace(protectedValue)) return null;
        try { return _secrets.Unprotect(protectedValue); }
        catch (System.Security.Cryptography.CryptographicException) { return null; }
    }

    private async Task<AgentTaskDto> ToDtoAsync(AgentTask task) => ToDto(task,
        task.AgentId is null ? null : await agents.FindAsync(task.WorkspaceId, task.AgentId.Value));

    private static AgentTaskDto ToDto(AgentTask task, WorkspaceAgent? agent) => new(
        task.Id, task.WorkspaceId, task.DocumentId, task.RequestedById, task.Prompt,
        task.Status.ToString().ToLowerInvariant(), task.WorkerId, task.Error, task.CreatedAt, task.UpdatedAt,
        task.AgentId, agent?.Name, agent?.AvatarUrl, agent?.Provider);
}
