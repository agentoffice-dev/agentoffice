using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public class WorkspaceService(AppDbContext db) : IWorkspaceService
{
    public async Task<IEnumerable<Workspace>> GetUserWorkspacesAsync(Guid userId) =>
        await db.Workspaces
            .Where(w => w.Members.Any(m => m.UserId == userId))
            .Include(w => w.Members).ThenInclude(m => m.User)
            .OrderByDescending(w => w.CreatedAt)
            .ToListAsync();

    public async Task<Workspace?> GetByIdAsync(Guid id, Guid userId) =>
        await db.Workspaces
            .Include(w => w.Members).ThenInclude(m => m.User)
            .FirstOrDefaultAsync(w => w.Id == id && w.Members.Any(m => m.UserId == userId));

    public async Task<Workspace> CreateAsync(string name, string? description, Guid ownerId)
    {
        var workspace = new Workspace { Name = name, Description = description };
        workspace.Members.Add(new WorkspaceUser { UserId = ownerId, Role = "Owner" });
        db.Workspaces.Add(workspace);
        await db.SaveChangesAsync();
        return (await GetByIdAsync(workspace.Id, ownerId))!;
    }

    public async Task<Workspace?> RenameAsync(Guid id, Guid userId, string name)
    {
        var workspace = await db.Workspaces
            .Include(w => w.Members).ThenInclude(m => m.User)
            .FirstOrDefaultAsync(w => w.Id == id && w.Members.Any(m => m.UserId == userId && m.Role == "Owner"));
        if (workspace is null) return null;
        workspace.Name = name;
        await db.SaveChangesAsync();
        return workspace;
    }

    public async Task<bool> DeleteAsync(Guid id, Guid userId)
    {
        var workspace = await db.Workspaces
            .Include(w => w.Members)
            .FirstOrDefaultAsync(w => w.Id == id && w.Members.Any(m => m.UserId == userId && m.Role == "Owner"));
        if (workspace is null) return false;

        db.Workspaces.Remove(workspace);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> AddMemberAsync(Guid workspaceId, Guid requesterId, string usernameOrEmail)
    {
        var isMember = await db.WorkspaceUsers.AnyAsync(wu => wu.WorkspaceId == workspaceId && wu.UserId == requesterId);
        if (!isMember) return false;

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == usernameOrEmail || u.Username == usernameOrEmail);
        if (user is null) return false;

        var alreadyMember = await db.WorkspaceUsers.AnyAsync(wu => wu.WorkspaceId == workspaceId && wu.UserId == user.Id);
        if (alreadyMember) return true;

        db.WorkspaceUsers.Add(new WorkspaceUser { WorkspaceId = workspaceId, UserId = user.Id });
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> RemoveMemberAsync(Guid workspaceId, Guid requesterId, Guid userId)
    {
        var requester = await db.WorkspaceUsers.FirstOrDefaultAsync(wu => wu.WorkspaceId == workspaceId && wu.UserId == requesterId);
        if (requester is null) return false;
        if (requester.Role != "Owner" && requesterId != userId) return false;

        var member = await db.WorkspaceUsers.FirstOrDefaultAsync(wu => wu.WorkspaceId == workspaceId && wu.UserId == userId);
        if (member is null) return false;

        db.WorkspaceUsers.Remove(member);
        await db.SaveChangesAsync();
        return true;
    }
}
