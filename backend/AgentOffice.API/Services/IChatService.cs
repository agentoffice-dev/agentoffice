using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public interface IChatService
{
    Task<IReadOnlyList<ChatMessageDto>?> GetHistoryAsync(Guid workspaceId, Guid userId, int take = 50);
    Task<ChatMessageDto?> SendAsync(Guid workspaceId, Guid userId, string content, Guid? documentId = null, Guid? agentTaskId = null);
}
