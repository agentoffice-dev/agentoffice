using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public class FolderService(AppDbContext db) : IFolderService
{
    public async Task<IEnumerable<Folder>> GetByWorkspaceAsync(Guid workspaceId) =>
        await db.Folders
            .Where(f => f.WorkspaceId == workspaceId)
            .OrderBy(f => f.Name)
            .ToListAsync();

    public async Task<Folder?> GetByIdAsync(Guid folderId, Guid workspaceId) =>
        await db.Folders.FirstOrDefaultAsync(f => f.Id == folderId && f.WorkspaceId == workspaceId);

    public async Task<Folder> CreateAsync(string name, Guid workspaceId, Guid? parentFolderId = null)
    {
        var folder = new Folder { Name = name, WorkspaceId = workspaceId, ParentFolderId = parentFolderId };
        db.Folders.Add(folder);
        await db.SaveChangesAsync();
        return folder;
    }

    public async Task<Folder?> RenameAsync(Guid folderId, Guid workspaceId, string name)
    {
        var folder = await GetByIdAsync(folderId, workspaceId);
        if (folder is null) return null;
        folder.Name = name;
        await db.SaveChangesAsync();
        return folder;
    }

    public async Task<bool> DeleteAsync(Guid folderId, Guid workspaceId)
    {
        var folder = await db.Folders
            .Include(f => f.Documents)
            .FirstOrDefaultAsync(f => f.Id == folderId && f.WorkspaceId == workspaceId);
        if (folder is null) return false;
        await DeleteRecursiveAsync(folder);
        await db.SaveChangesAsync();
        return true;
    }

    private async Task DeleteRecursiveAsync(Folder folder)
    {
        var subFolders = await db.Folders
            .Include(f => f.Documents)
            .Where(f => f.ParentFolderId == folder.Id)
            .ToListAsync();
        foreach (var sub in subFolders)
            await DeleteRecursiveAsync(sub);
        foreach (var doc in folder.Documents)
            doc.FolderId = null;
        db.Folders.Remove(folder);
    }
}
