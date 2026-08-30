using AgentOffice.API.Data;
using AgentOffice.API.Models;
using Microsoft.EntityFrameworkCore;

namespace AgentOffice.API.Services;

public interface IAgentScheduleService
{
    Task<IReadOnlyList<AgentScheduleDto>?> ListAsync(Guid workspaceId, Guid userId);
    Task<AgentScheduleDto?> CreateAsync(Guid workspaceId, Guid userId, SaveAgentScheduleRequest request);
    Task<AgentScheduleDto?> UpdateAsync(Guid workspaceId, Guid id, Guid userId, SaveAgentScheduleRequest request);
    Task<bool?> DeleteAsync(Guid workspaceId, Guid id, Guid userId);
    Task<AgentTaskDto?> RunNowAsync(Guid workspaceId, Guid id, Guid userId);
}

public class AgentScheduleService(AppDbContext db, IAgentTaskService tasks) : IAgentScheduleService
{
    public async Task<IReadOnlyList<AgentScheduleDto>?> ListAsync(Guid workspaceId, Guid userId)
    {
        if (!await IsMember(workspaceId, userId)) return null;
        var rows = await db.AgentSchedules.Where(x => x.WorkspaceId == workspaceId)
            .Include(x => x.Agent).Include(x => x.Document)
            .OrderBy(x => x.NextRunAt).ToListAsync();
        return rows.Select(ToDto).ToList();
    }

    public async Task<AgentScheduleDto?> CreateAsync(Guid workspaceId, Guid userId, SaveAgentScheduleRequest request)
    {
        if (!await IsMember(workspaceId, userId) || !await ReferencesAreValid(workspaceId, request)) return null;
        var schedule = new AgentSchedule { WorkspaceId = workspaceId, CreatedById = userId, Name = request.Name.Trim(), Prompt = request.Prompt.Trim() };
        Apply(schedule, request);
        db.AgentSchedules.Add(schedule);
        await db.SaveChangesAsync();
        await LoadReferences(schedule);
        return ToDto(schedule);
    }

    public async Task<AgentScheduleDto?> UpdateAsync(Guid workspaceId, Guid id, Guid userId, SaveAgentScheduleRequest request)
    {
        if (!await IsMember(workspaceId, userId) || !await ReferencesAreValid(workspaceId, request)) return null;
        var schedule = await db.AgentSchedules.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (schedule is null) return null;
        schedule.Name = request.Name.Trim(); schedule.Prompt = request.Prompt.Trim();
        Apply(schedule, request); schedule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await LoadReferences(schedule);
        return ToDto(schedule);
    }

    public async Task<bool?> DeleteAsync(Guid workspaceId, Guid id, Guid userId)
    {
        if (!await IsMember(workspaceId, userId)) return null;
        var schedule = await db.AgentSchedules.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (schedule is null) return false;
        db.AgentSchedules.Remove(schedule); await db.SaveChangesAsync(); return true;
    }

    public async Task<AgentTaskDto?> RunNowAsync(Guid workspaceId, Guid id, Guid userId)
    {
        if (!await IsMember(workspaceId, userId)) return null;
        var schedule = await db.AgentSchedules.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        return schedule is null ? null : await tasks.CreateAsync(workspaceId, schedule.DocumentId, userId, schedule.Prompt, schedule.AgentId);
    }

    private Task<bool> IsMember(Guid workspaceId, Guid userId) => db.WorkspaceUsers.AnyAsync(x => x.WorkspaceId == workspaceId && x.UserId == userId);
    private async Task<bool> ReferencesAreValid(Guid workspaceId, SaveAgentScheduleRequest r) =>
        (r.AgentId is null || await db.Agents.AnyAsync(x => x.Id == r.AgentId && x.WorkspaceId == workspaceId && x.Enabled)) &&
        (r.DocumentId is null || await db.Documents.AnyAsync(x => x.Id == r.DocumentId && x.WorkspaceId == workspaceId));

    private static void Apply(AgentSchedule s, SaveAgentScheduleRequest r)
    {
        s.AgentId = r.AgentId; s.DocumentId = r.DocumentId;
        s.Interval = Math.Clamp(r.Interval, 1, 10000);
        s.Unit = Enum.TryParse<AgentScheduleUnit>(r.Unit, true, out var unit) ? unit : AgentScheduleUnit.Days;
        s.Enabled = r.Enabled;
        s.NextRunAt = r.NextRunAt.ToUniversalTime();
    }

    private async Task LoadReferences(AgentSchedule s)
    {
        if (s.AgentId is not null) s.Agent = await db.Agents.FindAsync(s.AgentId);
        if (s.DocumentId is not null) s.Document = await db.Documents.FindAsync(s.DocumentId);
    }
    internal static AgentScheduleDto ToDto(AgentSchedule x) => new(x.Id, x.WorkspaceId, x.CreatedById, x.Name, x.Prompt,
        x.AgentId, x.Agent?.Name, x.DocumentId, x.Document?.FileName, x.Interval, x.Unit.ToString().ToLowerInvariant(),
        x.Enabled, x.NextRunAt, x.LastRunAt, x.LastTaskId, x.CreatedAt, x.UpdatedAt);
}
