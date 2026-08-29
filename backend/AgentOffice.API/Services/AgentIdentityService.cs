using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

/// <summary>Resolves the workspace identity that AI agents post and edit as.</summary>
public interface IAgentIdentity
{
    Task<User?> ResolveAsync();
    Task<User?> EnsureMemberAsync(Guid workspaceId);
}

public class AgentIdentityService(AppDbContext db, IConfiguration configuration) : IAgentIdentity
{
    public async Task<User?> ResolveAsync()
    {
        var email = configuration["AgentWorker:UserEmail"];
        return string.IsNullOrWhiteSpace(email)
            ? null
            : await db.Users.FirstOrDefaultAsync(user => user.Email == email);
    }

    public async Task<User?> EnsureMemberAsync(Guid workspaceId)
    {
        var agent = await ResolveAsync();
        if (agent is null) return null;

        var alreadyJoined = await db.WorkspaceUsers.AnyAsync(member =>
            member.WorkspaceId == workspaceId && member.UserId == agent.Id);
        if (alreadyJoined) return agent;

        db.WorkspaceUsers.Add(new WorkspaceUser { WorkspaceId = workspaceId, UserId = agent.Id, Role = "Agent" });
        await db.SaveChangesAsync();
        return agent;
    }
}
