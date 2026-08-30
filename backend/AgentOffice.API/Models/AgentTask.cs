using System.Text.Json.Serialization;

namespace AgentOffice.API.Models;

public enum AgentTaskStatus
{
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

public class AgentTask
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public Guid? DocumentId { get; set; }
    public Document? Document { get; set; }
    public Guid RequestedById { get; set; }
    public User RequestedBy { get; set; } = null!;
    /// <summary>The tagged agent. Null on tasks created before mentions, which fall back to the workspace default.</summary>
    public Guid? AgentId { get; set; }
    public WorkspaceAgent? Agent { get; set; }
    public required string Prompt { get; set; }
    public AgentTaskStatus Status { get; set; } = AgentTaskStatus.Queued;
    public string? WorkerId { get; set; }
    public string? Error { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClaimedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public ICollection<AgentTaskEvent> Events { get; set; } = [];
}

public class AgentTaskEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AgentTaskId { get; set; }
    public AgentTask AgentTask { get; set; } = null!;
    public required string Type { get; set; }
    public required string PayloadJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public record AgentTaskDto(
    Guid Id,
    Guid WorkspaceId,
    Guid? DocumentId,
    Guid RequestedById,
    string Prompt,
    string Status,
    string? WorkerId,
    string? Error,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    // The chat shows who was tagged, so the task carries the agent's identity with it.
    Guid? AgentId = null,
    string? AgentName = null,
    string? AgentAvatarUrl = null,
    string? AgentProvider = null);

public record AgentTaskEventDto(Guid Id, Guid AgentTaskId, string Type, string PayloadJson, DateTime CreatedAt);
public record AgentTaskCreatedEvent(AgentTaskDto Task);
public record AgentTaskUpdatedEvent(AgentTaskDto Task);
public record AgentTaskEventCreatedEvent(Guid WorkspaceId, AgentTaskEventDto Event);

public record AgentDocumentDto(Guid Id, string FileName, string ContentType, string Version);

public record AgentProfileDto(
    Guid Id,
    string Name,
    string Provider,
    string? Model,
    string? SystemPrompt,
    int MaxTurns,
    int TimeoutSeconds,
    string? PermissionMode,
    string? AuthMode,
    string? ApiKey,
    // Without this the camelCase policy emits "oAuthToken" and the worker sees nothing.
    [property: JsonPropertyName("oauthToken")] string? OAuthToken,
    // Carried for the stored schema; the pi runtime does not read them.
    string? ReasoningEffort,
    string? SandboxMode,
    string? ApprovalPolicy);

public record AgentSkillDto(Guid Id, string Name, string? Description, string Version, string Instructions);

public record AgentChatTurnDto(string SenderName, string Content, DateTime CreatedAt);

/// <summary>Everything a worker needs to run one task, delivered over the internal worker channel.</summary>
public record AgentTaskContextDto(
    AgentTaskDto Task,
    AgentDocumentDto? Document,
    AgentProfileDto? Agent,
    IReadOnlyList<AgentSkillDto> Skills,
    IReadOnlyList<AgentChatTurnDto> RecentMessages);
