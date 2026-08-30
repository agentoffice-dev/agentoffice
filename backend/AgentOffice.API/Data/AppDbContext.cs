using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Models;

namespace AgentOffice.API.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<Folder> Folders => Set<Folder>();
    public DbSet<User> Users => Set<User>();
    public DbSet<WopiLock> WopiLocks => Set<WopiLock>();
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<WorkspaceUser> WorkspaceUsers => Set<WorkspaceUser>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<AgentTask> AgentTasks => Set<AgentTask>();
    public DbSet<AgentTaskEvent> AgentTaskEvents => Set<AgentTaskEvent>();
    public DbSet<WorkspaceAgent> Agents => Set<WorkspaceAgent>();
    public DbSet<McpServer> McpServers => Set<McpServer>();
    public DbSet<AgentSkillDefinition> SkillDefinitions => Set<AgentSkillDefinition>();
    public DbSet<AgentMcpServer> AgentMcpServers => Set<AgentMcpServer>();
    public DbSet<AgentSkill> AgentSkills => Set<AgentSkill>();
    public DbSet<AgentSchedule> AgentSchedules => Set<AgentSchedule>();

    // Timestamps are UTC everywhere; SQLite drops that fact on the way in and out.
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WorkspaceUser>()
            .HasKey(wu => new { wu.WorkspaceId, wu.UserId });

        modelBuilder.Entity<WorkspaceUser>()
            .HasOne(wu => wu.Workspace)
            .WithMany(w => w.Members)
            .HasForeignKey(wu => wu.WorkspaceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<WorkspaceUser>()
            .HasOne(wu => wu.User)
            .WithMany(u => u.WorkspaceMemberships)
            .HasForeignKey(wu => wu.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Folder>()
            .HasOne(f => f.Workspace)
            .WithMany(w => w.Folders)
            .HasForeignKey(f => f.WorkspaceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Folder>()
            .HasOne(f => f.ParentFolder)
            .WithMany(f => f.SubFolders)
            .HasForeignKey(f => f.ParentFolderId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Document>()
            .HasOne(d => d.Workspace)
            .WithMany(w => w.Documents)
            .HasForeignKey(d => d.WorkspaceId)
            .IsRequired(false);

        modelBuilder.Entity<Document>()
            .HasOne(d => d.Folder)
            .WithMany(f => f.Documents)
            .HasForeignKey(d => d.FolderId)
            .IsRequired(false);

        modelBuilder.Entity<Document>()
            .HasOne(d => d.Owner)
            .WithMany()
            .HasForeignKey(d => d.OwnerId)
            .IsRequired(false);

        modelBuilder.Entity<ChatMessage>()
            .HasOne(message => message.Workspace)
            .WithMany()
            .HasForeignKey(message => message.WorkspaceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ChatMessage>()
            .HasOne(message => message.Sender)
            .WithMany()
            .HasForeignKey(message => message.SenderId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ChatMessage>()
            .HasIndex(message => new { message.WorkspaceId, message.CreatedAt });

        modelBuilder.Entity<AgentTask>()
            .HasOne(task => task.Workspace)
            .WithMany()
            .HasForeignKey(task => task.WorkspaceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AgentTask>()
            .HasOne(task => task.Document)
            .WithMany()
            .HasForeignKey(task => task.DocumentId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AgentTask>()
            .HasOne(task => task.RequestedBy)
            .WithMany()
            .HasForeignKey(task => task.RequestedById)
            .OnDelete(DeleteBehavior.Restrict);

        // Deleting an agent keeps its finished tasks; they fall back to the workspace default.
        modelBuilder.Entity<AgentTask>()
            .HasOne(task => task.Agent)
            .WithMany()
            .HasForeignKey(task => task.AgentId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<AgentTask>()
            .HasIndex(task => new { task.Status, task.CreatedAt });

        modelBuilder.Entity<AgentTaskEvent>()
            .HasOne(agentEvent => agentEvent.AgentTask)
            .WithMany(task => task.Events)
            .HasForeignKey(agentEvent => agentEvent.AgentTaskId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AgentSchedule>().HasOne(x => x.Workspace).WithMany()
            .HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AgentSchedule>().HasOne(x => x.CreatedBy).WithMany()
            .HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<AgentSchedule>().HasOne(x => x.Agent).WithMany()
            .HasForeignKey(x => x.AgentId).IsRequired(false).OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<AgentSchedule>().HasOne(x => x.Document).WithMany()
            .HasForeignKey(x => x.DocumentId).IsRequired(false).OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<AgentSchedule>().HasIndex(x => new { x.Enabled, x.NextRunAt });

        modelBuilder.Entity<WorkspaceAgent>().HasOne(x => x.Workspace).WithMany(x => x.Agents)
            .HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<McpServer>().HasOne(x => x.Workspace).WithMany(x => x.McpServers)
            .HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AgentSkillDefinition>().HasOne(x => x.Workspace).WithMany(x => x.Skills)
            .HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AgentMcpServer>().HasKey(x => new { x.AgentId, x.McpServerId });
        modelBuilder.Entity<AgentMcpServer>().HasOne(x => x.Agent).WithMany(x => x.McpServers)
            .HasForeignKey(x => x.AgentId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AgentMcpServer>().HasOne(x => x.McpServer).WithMany(x => x.Agents)
            .HasForeignKey(x => x.McpServerId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AgentSkill>().HasKey(x => new { x.AgentId, x.SkillId });
        modelBuilder.Entity<AgentSkill>().HasOne(x => x.Agent).WithMany(x => x.Skills)
            .HasForeignKey(x => x.AgentId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AgentSkill>().HasOne(x => x.Skill).WithMany(x => x.Agents)
            .HasForeignKey(x => x.SkillId).OnDelete(DeleteBehavior.Cascade);
    }
}
