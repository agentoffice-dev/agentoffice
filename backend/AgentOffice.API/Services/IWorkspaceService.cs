using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public interface IWorkspaceService
{
    Task<IEnumerable<Workspace>> GetUserWorkspacesAsync(Guid userId);
    Task<Workspace?> GetByIdAsync(Guid id, Guid userId);
    Task<Workspace> CreateAsync(string name, string? description, Guid ownerId);
    Task<bool> DeleteAsync(Guid id, Guid userId);
    Task<Workspace?> RenameAsync(Guid id, Guid userId, string name);
    Task<bool> AddMemberAsync(Guid workspaceId, Guid requesterId, string usernameOrEmail);
    Task<bool> RemoveMemberAsync(Guid workspaceId, Guid requesterId, Guid userId);
}
