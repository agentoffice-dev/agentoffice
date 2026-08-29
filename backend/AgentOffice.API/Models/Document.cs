namespace AgentOffice.API.Models;

public class Document
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public long Size { get; set; }
    public string Version { get; set; } = Guid.NewGuid().ToString("N");
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public required string StoragePath { get; set; }
    public Guid? WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }
    public Guid? FolderId { get; set; }
    public Folder? Folder { get; set; }
    public Guid? OwnerId { get; set; }
    public User? Owner { get; set; }
}
