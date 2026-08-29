using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AgentOffice.API.Models;
using AgentOffice.API.Services;

namespace AgentOffice.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class DocumentsController(
    IDocumentService docs,
    IWopiTokenService wopiTokens,
    IConfiguration config) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Document>>> GetAll() =>
        Ok(await docs.GetAllAsync());

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<Document>> GetById(Guid id)
    {
        var doc = await docs.GetByIdAsync(id);
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpPost]
    [RequestSizeLimit(104_857_600)]
    public async Task<ActionResult<Document>> Upload(IFormFile file)
    {
        if (file.Length == 0) return BadRequest(new { error = "Empty file." });
        var doc = await docs.UploadAsync(file);
        return CreatedAtAction(nameof(GetById), new { id = doc.Id }, doc);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id) =>
        await docs.DeleteAsync(id) ? NoContent() : NotFound();

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var result = await docs.GetFileStreamAsync(id);
        if (result is null) return NotFound();
        var (stream, doc) = result.Value;
        Response.Headers.ContentDisposition = $"attachment; filename=\"{Uri.EscapeDataString(doc.FileName)}\"";
        return File(stream, doc.ContentType);
    }

    [HttpPatch("{id:guid}/move")]
    public async Task<ActionResult<Document>> Move(Guid id, [FromBody] MoveDocumentRequest request)
    {
        var doc = await docs.MoveAsync(id, request.FolderId);
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpPatch("{id:guid}/rename")]
    public async Task<ActionResult<Document>> Rename(Guid id, [FromBody] RenameDocumentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FileName)) return BadRequest(new { error = "File name is required." });
        var doc = await docs.RenameAsync(id, request.FileName.Trim());
        return doc is null ? NotFound() : Ok(doc);
    }

    [HttpPost("{id:guid}/clone")]
    public async Task<ActionResult<Document>> Clone(Guid id, [FromBody] CloneDocumentRequest? request = null)
    {
        var clone = await docs.CloneAsync(id, request?.FileName, request?.FolderId);
        return clone is null ? NotFound() : CreatedAtAction(nameof(GetById), new { id = clone.Id }, clone);
    }

    [HttpGet("{id:guid}/wopi-token")]
    public async Task<ActionResult<object>> GetWopiToken(Guid id)
    {
        var doc = await docs.GetByIdAsync(id);
        if (doc is null) return NotFound();

        var token = wopiTokens.GenerateToken(id);
        var baseUrl = config["Wopi:BaseUrl"] ?? $"{Request.Scheme}://{Request.Host}";
        var ttlMs = (long)(DateTime.UtcNow.AddHours(24) - DateTime.UnixEpoch).TotalMilliseconds;
        var wopiSrc = $"{baseUrl}/wopi/files/{id}";

        return Ok(new
        {
            access_token = token,
            access_token_ttl = ttlMs,
            wopi_src = wopiSrc,
            wopi_src_encoded = Uri.EscapeDataString(wopiSrc),
            file_name = doc.FileName,
            file_id = doc.Id,
        });
    }
}

public record MoveDocumentRequest(Guid? FolderId);
public record RenameDocumentRequest(string FileName);
public record CloneDocumentRequest(string? FileName, Guid? FolderId);
