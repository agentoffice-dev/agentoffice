namespace AgentOffice.API.Models;

public class Workspace
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<WorkspaceUser> Members { get; set; } = [];
    public ICollection<Folder> Folders { get; set; } = [];
    public ICollection<Document> Documents { get; set; } = [];
    public ICollection<WorkspaceAgent> Agents { get; set; } = [];
    public ICollection<McpServer> McpServers { get; set; } = [];
    public ICollection<AgentSkillDefinition> Skills { get; set; } = [];
}
