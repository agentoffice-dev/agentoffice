using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AgentOffice.API.Services;

namespace AgentOffice.API.Controllers;

[Authorize]
[ApiController]
[Route("api/workspaces/{workspaceId:guid}/folders")]
public class FoldersController(IWorkspaceService workspaces, IFolderService folders, IDocumentService docs) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

    public record CreateFolderRequest(string Name, Guid? ParentFolderId);
    public record RenameFolderRequest(string Name);

    [HttpGet]
    public async Task<IActionResult> GetAll(Guid workspaceId)
    {
        if (await workspaces.GetByIdAsync(workspaceId, CurrentUserId) is null) return NotFound();
        var list = await folders.GetByWorkspaceAsync(workspaceId);
        return Ok(list.Select(f => new { f.Id, f.Name, f.WorkspaceId, f.ParentFolderId, f.CreatedAt }));
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid workspaceId, [FromBody] CreateFolderRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Folder name is required." });
        if (await workspaces.GetByIdAsync(workspaceId, CurrentUserId) is null) return NotFound();
        if (req.ParentFolderId is not null && await folders.GetByIdAsync(req.ParentFolderId.Value, workspaceId) is null)
            return NotFound();
        var folder = await folders.CreateAsync(req.Name, workspaceId, req.ParentFolderId);
        return Created($"/api/workspaces/{workspaceId}/folders/{folder.Id}",
            new { folder.Id, folder.Name, folder.WorkspaceId, folder.ParentFolderId, folder.CreatedAt });
    }

    [HttpPut("{folderId:guid}")]
    public async Task<IActionResult> Rename(Guid workspaceId, Guid folderId, [FromBody] RenameFolderRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Folder name is required." });
        if (await workspaces.GetByIdAsync(workspaceId, CurrentUserId) is null) return NotFound();
        var folder = await folders.RenameAsync(folderId, workspaceId, req.Name);
        return folder is null ? NotFound() : Ok(new { folder.Id, folder.Name, folder.WorkspaceId, folder.ParentFolderId, folder.CreatedAt });
    }

    [HttpDelete("{folderId:guid}")]
    public async Task<IActionResult> Delete(Guid workspaceId, Guid folderId)
    {
        if (await workspaces.GetByIdAsync(workspaceId, CurrentUserId) is null) return NotFound();
        return await folders.DeleteAsync(folderId, workspaceId) ? NoContent() : NotFound();
    }

    [HttpGet("{folderId:guid}/documents")]
    public async Task<IActionResult> GetDocuments(Guid workspaceId, Guid folderId)
    {
        if (await workspaces.GetByIdAsync(workspaceId, CurrentUserId) is null) return NotFound();
        if (await folders.GetByIdAsync(folderId, workspaceId) is null) return NotFound();
        return Ok(await docs.GetByFolderAsync(folderId));
    }

    [HttpPost("{folderId:guid}/documents")]
    [RequestSizeLimit(104_857_600)]
    public async Task<IActionResult> UploadDocument(Guid workspaceId, Guid folderId, IFormFile file)
    {
        if (await workspaces.GetByIdAsync(workspaceId, CurrentUserId) is null) return NotFound();
        if (await folders.GetByIdAsync(folderId, workspaceId) is null) return NotFound();
        if (file.Length == 0) return BadRequest(new { error = "Empty file." });
        var doc = await docs.UploadAsync(file, workspaceId, CurrentUserId, folderId);
        return Created($"/api/documents/{doc.Id}", doc);
    }
}
