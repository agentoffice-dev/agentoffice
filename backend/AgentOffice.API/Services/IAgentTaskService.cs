using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public interface IAgentTaskService
{
    Task<AgentTaskDto?> CreateAsync(Guid workspaceId, Guid? documentId, Guid userId, string prompt, Guid? agentId = null);
    Task<IReadOnlyList<AgentTaskDto>?> ListAsync(Guid workspaceId, Guid userId, int take);
    Task<AgentTaskDto?> ClaimAsync(string workerId);
    Task<AgentTaskContextDto?> GetContextAsync(Guid taskId);
    Task<AgentTaskEventDto?> AppendEventAsync(Guid taskId, string type, string payloadJson);
    Task<AgentTaskDto?> FinishAsync(Guid taskId, bool succeeded, string? error);
    Task<ChatMessageDto?> PostMessageAsync(Guid taskId, string content);
}
