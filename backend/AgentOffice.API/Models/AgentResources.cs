namespace AgentOffice.API.Models;

public class WorkspaceAgent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public required string Name { get; set; }
    public string? Description { get; set; }
    /// <summary>Optional custom avatar (absolute URL or data URI); blank falls back to the provider default.</summary>
    public string? AvatarUrl { get; set; }
    public required string Provider { get; set; }
    public string? Model { get; set; }
    public string? SystemPrompt { get; set; }
    public bool Enabled { get; set; } = true;
    public int MaxTurns { get; set; } = 30;
    public int TimeoutSeconds { get; set; } = 900;
    public string? AuthMode { get; set; }
    public string? ApiKeyEncrypted { get; set; }
    public string? OAuthTokenEncrypted { get; set; }
    public string? ReasoningEffort { get; set; }
    public string? SandboxMode { get; set; }
    public string? ApprovalPolicy { get; set; }
    public string? PermissionMode { get; set; }
    public string? EndpointUrl { get; set; }
    public string? Protocol { get; set; }
    public string? HeadersJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<AgentMcpServer> McpServers { get; set; } = [];
    public ICollection<AgentSkill> Skills { get; set; } = [];
}

public class McpServer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public required string Name { get; set; }
    public string? Description { get; set; }
    public required string Transport { get; set; }
    public string? EndpointUrl { get; set; }
    public string? Command { get; set; }
    public string? ArgumentsJson { get; set; }
    public string? AuthType { get; set; }
    public string? CredentialEncrypted { get; set; }
    public string? HeadersJson { get; set; }
    public bool Enabled { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<AgentMcpServer> Agents { get; set; } = [];
}

public class AgentSkillDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public required string Name { get; set; }
    public string? Description { get; set; }
    public string Version { get; set; } = "1.0.0";
    public required string Instructions { get; set; }
    public bool Enabled { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<AgentSkill> Agents { get; set; } = [];
}

public class AgentMcpServer
{
    public Guid AgentId { get; set; }
    public WorkspaceAgent Agent { get; set; } = null!;
    public Guid McpServerId { get; set; }
    public McpServer McpServer { get; set; } = null!;
}

public class AgentSkill
{
    public Guid AgentId { get; set; }
    public WorkspaceAgent Agent { get; set; } = null!;
    public Guid SkillId { get; set; }
    public AgentSkillDefinition Skill { get; set; } = null!;
}
