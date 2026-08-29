namespace AgentOffice.API.Models;

public class ChatMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public Guid SenderId { get; set; }
    public User Sender { get; set; } = null!;
    public required string Content { get; set; }
    public Guid? DocumentId { get; set; }
    public Guid? AgentTaskId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public record ChatMessageDto(
    Guid Id,
    Guid WorkspaceId,
    Guid SenderId,
    string SenderName,
    string Content,
    DateTime CreatedAt,
    Guid? DocumentId = null,
    Guid? AgentTaskId = null);

public record MessageCreatedEvent(ChatMessageDto Message);
