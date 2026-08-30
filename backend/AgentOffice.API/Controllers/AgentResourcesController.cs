using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Models;

namespace AgentOffice.API.Controllers;

[Authorize]
[ApiController]
[Route("api/workspaces/{workspaceId:guid}")]
public class AgentResourcesController(AppDbContext db, IDataProtectionProvider protectionProvider, IConfiguration configuration) : ControllerBase
{
    private static readonly HashSet<string> AgentProviders = new(StringComparer.OrdinalIgnoreCase)
    {
        "amazon-bedrock", "ant-ling", "anthropic", "azure-openai-responses", "baseten", "cerebras",
        "cloudflare-ai-gateway", "cloudflare-workers-ai", "deepseek", "fireworks", "github-copilot",
        "google", "google-vertex", "groq", "huggingface", "kimi-coding", "minimax", "minimax-cn",
        "mistral", "moonshotai", "moonshotai-cn", "nvidia", "openai", "openai-codex", "opencode",
        "opencode-go", "openrouter", "qwen-token-plan", "qwen-token-plan-cn", "qwen-token-plan-individual",
        "radius", "together", "vercel-ai-gateway", "xai", "xiaomi", "xiaomi-token-plan-ams",
        "xiaomi-token-plan-cn", "xiaomi-token-plan-sgp", "zai", "zai-coding-cn",
    };
    private static readonly HashSet<string> OAuthProviders = new(StringComparer.OrdinalIgnoreCase)
    { "anthropic", "github-copilot", "kimi-coding", "openai-codex", "openrouter", "radius", "xai" };
    private readonly IDataProtector _secrets = protectionProvider.CreateProtector("AgentOffice.ResourceSecrets.v1");
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);
    private const string AvatarRoute = "/api/agent-avatars";
    private const long MaxAvatarBytes = 2 * 1024 * 1024;
    private static readonly Dictionary<string, string> AvatarExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/png"] = ".png", ["image/jpeg"] = ".jpg", ["image/webp"] = ".webp", ["image/gif"] = ".gif",
    };
    private readonly string _avatarRoot = Path.Combine(configuration["Storage:UploadPath"] ?? "uploads", "agent-avatars");

    [HttpGet("agents")]
    public async Task<IActionResult> ListAgents(Guid workspaceId)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        var agents = await db.Agents.Where(x => x.WorkspaceId == workspaceId)
            .Include(x => x.McpServers).Include(x => x.Skills).OrderBy(x => x.Name).ToListAsync();
        return Ok(agents.Select(ToAgentDto));
    }

    [HttpPost("agents")]
    public async Task<IActionResult> CreateAgent(Guid workspaceId, [FromBody] SaveAgentRequest request)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        if (!ValidateAgent(request, out var error)) return BadRequest(new { error });
        var agent = new WorkspaceAgent { WorkspaceId = workspaceId, Name = request.Name.Trim(), Provider = request.Provider.ToLowerInvariant() };
        await ApplyAgent(agent, workspaceId, request);
        db.Agents.Add(agent);
        await db.SaveChangesAsync();
        return Ok(ToAgentDto(agent));
    }

    [HttpPut("agents/{id:guid}")]
    public async Task<IActionResult> UpdateAgent(Guid workspaceId, Guid id, [FromBody] SaveAgentRequest request)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        if (!ValidateAgent(request, out var error)) return BadRequest(new { error });
        var agent = await db.Agents.Include(x => x.McpServers).Include(x => x.Skills)
            .FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (agent is null) return NotFound();
        await ApplyAgent(agent, workspaceId, request);
        await db.SaveChangesAsync();
        return Ok(ToAgentDto(agent));
    }

    [HttpDelete("agents/{id:guid}")]
    public async Task<IActionResult> DeleteAgent(Guid workspaceId, Guid id)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        var agent = await db.Agents.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (agent is null) return NotFound();
        DeleteUploadedAvatar(agent.AvatarUrl);
        db.Agents.Remove(agent); await db.SaveChangesAsync(); return NoContent();
    }

    [HttpPost("agents/avatar")]
    [RequestSizeLimit(MaxAvatarBytes)]
    public async Task<IActionResult> UploadAgentAvatar(Guid workspaceId, IFormFile? file)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        if (file is null || file.Length == 0) return BadRequest(new { error = "Choose an image to upload." });
        if (file.Length > MaxAvatarBytes) return BadRequest(new { error = "Avatar images must be 2 MB or smaller." });
        if (!AvatarExtensions.TryGetValue(file.ContentType ?? string.Empty, out var extension))
            return BadRequest(new { error = "Avatar must be a PNG, JPEG, WebP or GIF image." });

        Directory.CreateDirectory(_avatarRoot);
        var fileName = $"{Guid.NewGuid()}{extension}";
        await using (var target = System.IO.File.Create(Path.Combine(_avatarRoot, fileName)))
            await file.CopyToAsync(target);
        // The agent keeps its old picture until the form is saved with this URL.
        return Ok(new { url = $"{AvatarRoute}/{fileName}" });
    }

    /// <summary>
    /// Avatars are rendered by an &lt;img&gt; tag, which cannot carry the bearer token,
    /// so the bytes are served anonymously from behind an unguessable file name.
    /// </summary>
    [AllowAnonymous]
    [HttpGet(AvatarRoute + "/{fileName}")]
    public IActionResult GetAgentAvatar(string fileName)
    {
        if (!IsAvatarFileName(fileName)) return NotFound();
        var path = Path.GetFullPath(Path.Combine(_avatarRoot, fileName));
        if (!System.IO.File.Exists(path)) return NotFound();
        // Every upload gets a fresh name, so a cached avatar can never go stale.
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return PhysicalFile(path, AvatarContentType(fileName));
    }

    [HttpGet("mcp-servers")]
    public async Task<IActionResult> ListMcpServers(Guid workspaceId) =>
        !await IsMember(workspaceId) ? Forbid() : Ok((await db.McpServers.Where(x => x.WorkspaceId == workspaceId).OrderBy(x => x.Name).ToListAsync()).Select(ToMcpDto));

    [HttpPost("mcp-servers")]
    public async Task<IActionResult> CreateMcpServer(Guid workspaceId, [FromBody] SaveMcpRequest request)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Name) || !new[] { "http", "stdio" }.Contains(request.Transport)) return BadRequest(new { error = "Name and a valid transport are required." });
        var item = new McpServer { WorkspaceId = workspaceId, Name = request.Name.Trim(), Transport = request.Transport };
        ApplyMcp(item, request); db.McpServers.Add(item); await db.SaveChangesAsync(); return Ok(ToMcpDto(item));
    }

    [HttpPut("mcp-servers/{id:guid}")]
    public async Task<IActionResult> UpdateMcpServer(Guid workspaceId, Guid id, [FromBody] SaveMcpRequest request)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        var item = await db.McpServers.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (item is null) return NotFound();
        item.Name = request.Name.Trim(); item.Transport = request.Transport; ApplyMcp(item, request); await db.SaveChangesAsync(); return Ok(ToMcpDto(item));
    }

    [HttpDelete("mcp-servers/{id:guid}")]
    public async Task<IActionResult> DeleteMcpServer(Guid workspaceId, Guid id)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        var item = await db.McpServers.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (item is null) return NotFound(); db.McpServers.Remove(item); await db.SaveChangesAsync(); return NoContent();
    }

    [HttpGet("skills")]
    public async Task<IActionResult> ListSkills(Guid workspaceId) =>
        !await IsMember(workspaceId) ? Forbid() : Ok((await db.SkillDefinitions.Where(x => x.WorkspaceId == workspaceId).OrderBy(x => x.Name).ToListAsync()).Select(ToSkillDto));

    [HttpPost("skills")]
    public async Task<IActionResult> CreateSkill(Guid workspaceId, [FromBody] SaveSkillRequest request)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Instructions)) return BadRequest(new { error = "Name and instructions are required." });
        var name = request.Name.Trim();
        if (await db.SkillDefinitions.AnyAsync(x => x.WorkspaceId == workspaceId && x.Name.ToLower() == name.ToLower()))
            return Conflict(new { error = "Skill names must be unique within a workspace." });
        var item = new AgentSkillDefinition { WorkspaceId = workspaceId, Name = name, Instructions = request.Instructions };
        ApplySkill(item, request); db.SkillDefinitions.Add(item); await db.SaveChangesAsync(); return Ok(ToSkillDto(item));
    }

    [HttpPut("skills/{id:guid}")]
    public async Task<IActionResult> UpdateSkill(Guid workspaceId, Guid id, [FromBody] SaveSkillRequest request)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Instructions)) return BadRequest(new { error = "Name and instructions are required." });
        var item = await db.SkillDefinitions.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (item is null) return NotFound();
        var name = request.Name.Trim();
        if (await db.SkillDefinitions.AnyAsync(x => x.WorkspaceId == workspaceId && x.Id != id && x.Name.ToLower() == name.ToLower()))
            return Conflict(new { error = "Skill names must be unique within a workspace." });
        item.Name = name; item.Instructions = request.Instructions; ApplySkill(item, request); await db.SaveChangesAsync(); return Ok(ToSkillDto(item));
    }

    [HttpDelete("skills/{id:guid}")]
    public async Task<IActionResult> DeleteSkill(Guid workspaceId, Guid id)
    {
        if (!await IsMember(workspaceId)) return Forbid();
        var item = await db.SkillDefinitions.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == workspaceId);
        if (item is null) return NotFound(); db.SkillDefinitions.Remove(item); await db.SaveChangesAsync(); return NoContent();
    }

    /// <summary>
    /// Secrets never contain whitespace, but pasting one out of a wrapped terminal
    /// line does. Stripping it here turns a silent 401 into a working credential.
    /// </summary>
    private static string? Sanitize(string? secret)
    {
        if (string.IsNullOrWhiteSpace(secret)) return null;
        var cleaned = new string(secret.Where(character => !char.IsWhiteSpace(character)).ToArray());
        return cleaned.Length == 0 ? null : cleaned;
    }

    private Task<bool> IsMember(Guid workspaceId) => db.WorkspaceUsers.AnyAsync(x => x.WorkspaceId == workspaceId && x.UserId == CurrentUserId);

    private async Task ApplyAgent(WorkspaceAgent agent, Guid workspaceId, SaveAgentRequest r)
    {
        agent.Name = r.Name.Trim(); agent.Description = r.Description; agent.Provider = r.Provider.ToLowerInvariant();
        TryNormalizeAvatarUrl(r.AvatarUrl, out var avatarUrl, out _);
        if (!string.Equals(agent.AvatarUrl, avatarUrl, StringComparison.Ordinal)) DeleteUploadedAvatar(agent.AvatarUrl);
        agent.AvatarUrl = avatarUrl;
        agent.Model = r.Model; agent.SystemPrompt = r.SystemPrompt; agent.Enabled = r.Enabled; agent.MaxTurns = Math.Clamp(r.MaxTurns, 1, 200);
        agent.TimeoutSeconds = Math.Clamp(r.TimeoutSeconds, 30, 7200); agent.AuthMode = r.AuthMode; agent.ReasoningEffort = r.ReasoningEffort;
        agent.SandboxMode = r.SandboxMode; agent.ApprovalPolicy = r.ApprovalPolicy; agent.PermissionMode = r.PermissionMode;
        agent.EndpointUrl = r.EndpointUrl; agent.Protocol = r.Protocol; agent.HeadersJson = r.HeadersJson; agent.UpdatedAt = DateTime.UtcNow;
        if (Sanitize(r.ApiKey) is { } apiKey) agent.ApiKeyEncrypted = _secrets.Protect(apiKey);
        if (Sanitize(r.OAuthToken) is { } oauthToken) agent.OAuthTokenEncrypted = _secrets.Protect(oauthToken);
        var mcpIds = await db.McpServers.Where(x => x.WorkspaceId == workspaceId && r.McpServerIds.Contains(x.Id)).Select(x => x.Id).ToListAsync();
        var skillIds = await db.SkillDefinitions.Where(x => x.WorkspaceId == workspaceId && r.SkillIds.Contains(x.Id)).Select(x => x.Id).ToListAsync();
        agent.McpServers.Clear(); foreach (var id in mcpIds) agent.McpServers.Add(new AgentMcpServer { AgentId = agent.Id, McpServerId = id });
        agent.Skills.Clear(); foreach (var id in skillIds) agent.Skills.Add(new AgentSkill { AgentId = agent.Id, SkillId = id });
    }

    private void ApplyMcp(McpServer item, SaveMcpRequest r)
    {
        item.Description = r.Description; item.EndpointUrl = r.EndpointUrl; item.Command = r.Command; item.ArgumentsJson = r.ArgumentsJson;
        item.AuthType = r.AuthType; item.HeadersJson = r.HeadersJson; item.Enabled = r.Enabled; item.UpdatedAt = DateTime.UtcNow;
        if (Sanitize(r.Credential) is { } credential) item.CredentialEncrypted = _secrets.Protect(credential);
    }
    private static void ApplySkill(AgentSkillDefinition item, SaveSkillRequest r) { item.Description = r.Description; item.Version = r.Version; item.Enabled = r.Enabled; item.UpdatedAt = DateTime.UtcNow; }
    private static bool ValidateAgent(SaveAgentRequest r, out string error)
    {
        var provider = r.Provider?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(r.Name) || provider is null || !AgentProviders.Contains(provider)) { error = "Name and a valid model provider are required."; return false; }
        if (string.IsNullOrWhiteSpace(r.Model)) { error = "A model id is required."; return false; }
        if (r.AuthMode is not (null or "api_key" or "oauth_token")) { error = "Invalid authentication mode."; return false; }
        if (r.AuthMode == "oauth_token" && !OAuthProviders.Contains(provider)) { error = $"OAuth token authentication is not supported for {provider}."; return false; }
        if (provider == "openai-codex" && r.AuthMode != "oauth_token") { error = "OpenAI Codex requires OAuth token authentication."; return false; }
        if (!TryNormalizeAvatarUrl(r.AvatarUrl, out _, out error)) return false;
        error = string.Empty; return true;
    }

    /// <summary>
    /// The avatar ends up as an image source in the browser, so only picture-bearing
    /// schemes are stored; a blank value means "use the provider default".
    /// </summary>
    private static bool TryNormalizeAvatarUrl(string? value, out string? normalized, out string error)
    {
        normalized = null; error = string.Empty;
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return true;
        var allowed = new[] { "https://", "http://", "data:image/", "/" }
            .Any(prefix => trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
        if (!allowed) { error = "Avatar must be an http(s) URL, a site-relative path, or a data:image URI."; return false; }
        normalized = trimmed; return true;
    }

    private static bool IsAvatarFileName(string fileName) =>
        Guid.TryParse(Path.GetFileNameWithoutExtension(fileName), out _) &&
        AvatarExtensions.ContainsValue(Path.GetExtension(fileName).ToLowerInvariant());

    private static string AvatarContentType(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".png" => "image/png", ".jpg" => "image/jpeg", ".webp" => "image/webp", ".gif" => "image/gif",
        _ => "application/octet-stream",
    };

    /// <summary>An uploaded avatar belongs to exactly one agent, so replacing or deleting it removes the file.</summary>
    private void DeleteUploadedAvatar(string? avatarUrl)
    {
        if (string.IsNullOrEmpty(avatarUrl) || !avatarUrl.StartsWith(AvatarRoute + "/", StringComparison.Ordinal)) return;
        var fileName = avatarUrl[(AvatarRoute.Length + 1)..];
        if (!IsAvatarFileName(fileName)) return;
        var path = Path.Combine(_avatarRoot, fileName);
        try { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); } catch { /* an orphaned file is harmless */ }
    }

    private static object ToAgentDto(WorkspaceAgent x) => new { x.Id, x.WorkspaceId, x.Name, x.Description, x.AvatarUrl, x.Provider, x.Model, x.SystemPrompt, x.Enabled, x.MaxTurns, x.TimeoutSeconds, x.AuthMode, HasApiKey = x.ApiKeyEncrypted != null, HasOAuthToken = x.OAuthTokenEncrypted != null, x.ReasoningEffort, x.SandboxMode, x.ApprovalPolicy, x.PermissionMode, x.EndpointUrl, x.Protocol, x.HeadersJson, McpServerIds = x.McpServers.Select(y => y.McpServerId), SkillIds = x.Skills.Select(y => y.SkillId), x.CreatedAt, x.UpdatedAt };
    private static object ToMcpDto(McpServer x) => new { x.Id, x.WorkspaceId, x.Name, x.Description, x.Transport, x.EndpointUrl, x.Command, x.ArgumentsJson, x.AuthType, HasCredential = x.CredentialEncrypted != null, x.HeadersJson, x.Enabled, x.CreatedAt, x.UpdatedAt };
    private static object ToSkillDto(AgentSkillDefinition x) => new { x.Id, x.WorkspaceId, x.Name, x.Description, x.Version, x.Instructions, x.Enabled, x.CreatedAt, x.UpdatedAt };
}

public record SaveAgentRequest(string Name, string Provider, string? Description, string? AvatarUrl, string? Model, string? SystemPrompt, bool Enabled, int MaxTurns, int TimeoutSeconds, string? AuthMode, string? ApiKey, string? OAuthToken, string? ReasoningEffort, string? SandboxMode, string? ApprovalPolicy, string? PermissionMode, string? EndpointUrl, string? Protocol, string? HeadersJson, Guid[] McpServerIds, Guid[] SkillIds);
public record SaveMcpRequest(string Name, string Transport, string? Description, string? EndpointUrl, string? Command, string? ArgumentsJson, string? AuthType, string? Credential, string? HeadersJson, bool Enabled);
public record SaveSkillRequest(string Name, string? Description, string Version, string Instructions, bool Enabled);
