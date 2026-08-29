using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Events;
using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public class ChatService(AppDbContext db, IEventPublisher events) : IChatService
{
    public async Task<IReadOnlyList<ChatMessageDto>?> GetHistoryAsync(Guid workspaceId, Guid userId, int take = 50)
    {
        if (!await IsMemberAsync(workspaceId, userId)) return null;
        var messages = await db.ChatMessages
            .Where(message => message.WorkspaceId == workspaceId)
            .OrderByDescending(message => message.CreatedAt)
            .Take(Math.Clamp(take, 1, 100))
            .Select(message => new ChatMessageDto(message.Id, message.WorkspaceId, message.SenderId,
                message.Sender.Username, message.Content, message.CreatedAt, message.DocumentId, message.AgentTaskId))
            .ToListAsync();
        messages.Reverse();
        return messages;
    }

    public async Task<ChatMessageDto?> SendAsync(
        Guid workspaceId, Guid userId, string content, Guid? documentId = null, Guid? agentTaskId = null)
    {
        if (!await IsMemberAsync(workspaceId, userId)) return null;
        var sender = await db.Users.FindAsync(userId);
        if (sender is null) return null;

        var message = new ChatMessage
        {
            WorkspaceId = workspaceId,
            SenderId = userId,
            Content = content.Trim(),
            DocumentId = documentId,
            AgentTaskId = agentTaskId,
        };
        db.ChatMessages.Add(message);
        await db.SaveChangesAsync();

        var dto = new ChatMessageDto(message.Id, workspaceId, userId, sender.Username, message.Content,
            message.CreatedAt, message.DocumentId, message.AgentTaskId);
        await events.PublishAsync(new MessageCreatedEvent(dto));
        return dto;
    }

    private Task<bool> IsMemberAsync(Guid workspaceId, Guid userId) =>
        db.WorkspaceUsers.AnyAsync(member => member.WorkspaceId == workspaceId && member.UserId == userId);
}
