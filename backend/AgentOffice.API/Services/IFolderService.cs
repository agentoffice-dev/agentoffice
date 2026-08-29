using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public interface IFolderService
{
    Task<IEnumerable<Folder>> GetByWorkspaceAsync(Guid workspaceId);
    Task<Folder?> GetByIdAsync(Guid folderId, Guid workspaceId);
    Task<Folder> CreateAsync(string name, Guid workspaceId, Guid? parentFolderId = null);
    Task<Folder?> RenameAsync(Guid folderId, Guid workspaceId, string name);
    Task<bool> DeleteAsync(Guid folderId, Guid workspaceId);
}
