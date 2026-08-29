using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Models;
using AgentOffice.API.Services;

namespace AgentOffice.API.Controllers;

[ApiController]
[Route("wopi/files")]
public class WopiController(
    IDocumentService docs,
    IWopiTokenService tokenService,
    AppDbContext db,
    ILogger<WopiController> logger) : ControllerBase
{
    // GET /wopi/files/{fileId}  —  CheckFileInfo
    [HttpGet("{fileId:guid}")]
    public async Task<IActionResult> CheckFileInfo(Guid fileId, [FromQuery] string? access_token)
    {
        if (!ValidateToken(access_token, fileId, out var userId))
            return Unauthorized();

        var doc = await docs.GetByIdAsync(fileId);
        if (doc is null) return NotFound();

        return Ok(new WopiCheckFileInfo
        {
            BaseFileName = doc.FileName,
            Size = doc.Size,
            Version = doc.Version,
            UserId = userId ?? "user1",
            UserFriendlyName = userId ?? "User",
            LastModifiedTime = doc.UpdatedAt.ToString("o"),
        });
    }

    // GET /wopi/files/{fileId}/contents  —  GetFile
    [HttpGet("{fileId:guid}/contents")]
    public async Task<IActionResult> GetFile(Guid fileId, [FromQuery] string? access_token)
    {
        if (!ValidateToken(access_token, fileId, out _))
            return Unauthorized();

        var result = await docs.GetFileStreamAsync(fileId);
        if (result is null) return NotFound();

        var (stream, doc) = result.Value;
        return File(stream, doc.ContentType);
    }

    // POST /wopi/files/{fileId}/contents  —  PutFile
    [HttpPost("{fileId:guid}/contents")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> PutFile(Guid fileId, [FromQuery] string? access_token)
    {
        logger.LogInformation("PutFile called: fileId={FileId} tokenPresent={HasToken} contentLength={Len}",
            fileId, !string.IsNullOrEmpty(access_token), Request.ContentLength);

        if (!ValidateToken(access_token, fileId, out _))
        {
            logger.LogWarning("PutFile 401: token invalid or missing for {FileId}", fileId);
            return Unauthorized();
        }

        var doc = await docs.GetByIdAsync(fileId);
        if (doc is null) return NotFound();

        var lockHeader = Request.Headers["X-WOPI-Lock"].FirstOrDefault();
        var existingLock = await GetActiveLock(fileId);

        if (existingLock is not null && existingLock.LockValue != lockHeader)
        {
            logger.LogWarning("PutFile 409: lock mismatch for {FileId} — existing={Existing} received={Received}",
                fileId, existingLock.LockValue, lockHeader);
            Response.Headers["X-WOPI-Lock"] = existingLock.LockValue;
            return StatusCode(409);
        }

        await docs.UpdateFileAsync(fileId, Request.Body);
        logger.LogInformation("PutFile 200: saved {FileId}", fileId);
        return Ok();
    }

    // POST /wopi/files/{fileId}  —  Lock / Unlock / RefreshLock / GetLock / etc.
    [HttpPost("{fileId:guid}")]
    public async Task<IActionResult> HandleOverride(Guid fileId, [FromQuery] string? access_token)
    {
        if (!ValidateToken(access_token, fileId, out _))
            return Unauthorized();

        var wopiOverride = Request.Headers["X-WOPI-Override"].FirstOrDefault();
        logger.LogInformation("WOPI {Override} for {FileId}", wopiOverride, fileId);

        return wopiOverride switch
        {
            "LOCK" => await HandleLock(fileId),
            "UNLOCK" => await HandleUnlock(fileId),
            "REFRESH_LOCK" => await HandleRefreshLock(fileId),
            "GET_LOCK" => await HandleGetLock(fileId),
            _ => StatusCode(501, $"Unsupported override: {wopiOverride}")
        };
    }

    private async Task<IActionResult> HandleLock(Guid fileId)
    {
        var newLock = Request.Headers["X-WOPI-Lock"].FirstOrDefault();
        if (string.IsNullOrEmpty(newLock)) return BadRequest();

        var existing = await GetActiveLock(fileId);
        if (existing is not null)
        {
            if (existing.LockValue == newLock)
            {
                existing.Expiry = DateTime.UtcNow.AddMinutes(30);
                await db.SaveChangesAsync();
                return Ok();
            }
            Response.Headers["X-WOPI-Lock"] = existing.LockValue;
            return StatusCode(409);
        }

        db.WopiLocks.Add(new WopiLock
        {
            FileId = fileId,
            LockValue = newLock,
            Expiry = DateTime.UtcNow.AddMinutes(30),
        });
        await db.SaveChangesAsync();
        return Ok();
    }

    private async Task<IActionResult> HandleUnlock(Guid fileId)
    {
        var lockValue = Request.Headers["X-WOPI-Lock"].FirstOrDefault();
        var existing = await GetActiveLock(fileId);

        if (existing is null || existing.LockValue != lockValue)
        {
            Response.Headers["X-WOPI-Lock"] = existing?.LockValue ?? "";
            return StatusCode(409);
        }

        db.WopiLocks.Remove(existing);
        await db.SaveChangesAsync();
        return Ok();
    }

    private async Task<IActionResult> HandleRefreshLock(Guid fileId)
    {
        var lockValue = Request.Headers["X-WOPI-Lock"].FirstOrDefault();
        var existing = await GetActiveLock(fileId);

        if (existing is null || existing.LockValue != lockValue)
        {
            Response.Headers["X-WOPI-Lock"] = existing?.LockValue ?? "";
            return StatusCode(409);
        }

        existing.Expiry = DateTime.UtcNow.AddMinutes(30);
        await db.SaveChangesAsync();
        return Ok();
    }

    private async Task<IActionResult> HandleGetLock(Guid fileId)
    {
        var existing = await GetActiveLock(fileId);
        Response.Headers["X-WOPI-Lock"] = existing?.LockValue ?? "";
        return Ok();
    }

    private async Task<WopiLock?> GetActiveLock(Guid fileId) =>
        await db.WopiLocks
            .Where(l => l.FileId == fileId && l.Expiry > DateTime.UtcNow)
            .FirstOrDefaultAsync();

    private bool ValidateToken(string? token, Guid fileId, out string? userId)
    {
        userId = null;
        if (string.IsNullOrEmpty(token)) return false;
        var result = tokenService.ValidateToken(token);
        if (result is null || result.Value.fileId != fileId) return false;
        userId = result.Value.userId;
        return true;
    }
}
