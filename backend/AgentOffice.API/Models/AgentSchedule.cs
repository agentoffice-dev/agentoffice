namespace AgentOffice.API.Models;

public enum AgentScheduleUnit
{
    Minutes,
    Hours,
    Days,
    Weeks,
}

public class AgentSchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public Guid CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
    public Guid? AgentId { get; set; }
    public WorkspaceAgent? Agent { get; set; }
    public Guid? DocumentId { get; set; }
    public Document? Document { get; set; }
    public required string Name { get; set; }
    public required string Prompt { get; set; }
    public int Interval { get; set; } = 1;
    public AgentScheduleUnit Unit { get; set; } = AgentScheduleUnit.Days;
    public bool Enabled { get; set; } = true;
    public DateTime NextRunAt { get; set; }
    public DateTime? LastRunAt { get; set; }
    public Guid? LastTaskId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public record AgentScheduleDto(
    Guid Id, Guid WorkspaceId, Guid CreatedById, string Name, string Prompt,
    Guid? AgentId, string? AgentName, Guid? DocumentId, string? DocumentName,
    int Interval, string Unit, bool Enabled, DateTime NextRunAt,
    DateTime? LastRunAt, Guid? LastTaskId, DateTime CreatedAt, DateTime UpdatedAt);

public record SaveAgentScheduleRequest(
    string Name, string Prompt, Guid? AgentId, Guid? DocumentId,
    int Interval, string Unit, bool Enabled, DateTime NextRunAt);
