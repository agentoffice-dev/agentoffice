using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AgentOffice.API.Models;
using AgentOffice.API.Services;

namespace AgentOffice.API.Controllers;

[ApiController]
public class AgentTasksController(
    IAgentTaskService tasks,
    IDocumentService documents,
    IAgentIdentity agentIdentity,
    IConfiguration configuration) : ControllerBase
{
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

    [Authorize]
    [HttpPost("api/workspaces/{workspaceId:guid}/agent-tasks")]
    public async Task<ActionResult<AgentTaskDto>> Create(Guid workspaceId, [FromBody] CreateAgentTaskRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt)) return BadRequest(new { error = "Prompt is required." });
        var task = await tasks.CreateAsync(workspaceId, request.DocumentId, CurrentUserId, request.Prompt, request.AgentId);
        return task is null ? Forbid() : Ok(task);
    }

    [Authorize]
    [HttpGet("api/workspaces/{workspaceId:guid}/agent-tasks")]
    public async Task<ActionResult<IReadOnlyList<AgentTaskDto>>> List(Guid workspaceId, [FromQuery] int take = 20)
    {
        var result = await tasks.ListAsync(workspaceId, CurrentUserId, take);
        return result is null ? Forbid() : Ok(result);
    }

    [HttpPost("internal/agent-tasks/claim")]
    public async Task<ActionResult<AgentTaskDto>> Claim([FromBody] ClaimAgentTaskRequest request)
    {
        if (!IsWorkerAuthorized()) return Unauthorized();
        var task = await tasks.ClaimAsync(request.WorkerId);
        return task is null ? NoContent() : Ok(task);
    }

    [HttpGet("internal/agent-tasks/{taskId:guid}/context")]
    public async Task<ActionResult<AgentTaskContextDto>> GetContext(Guid taskId)
    {
        if (!IsWorkerAuthorized()) return Unauthorized();
        var context = await tasks.GetContextAsync(taskId);
        return context is null ? NotFound() : Ok(context);
    }

    [HttpPost("internal/agent-tasks/{taskId:guid}/messages")]
    public async Task<ActionResult<ChatMessageDto>> PostMessage(Guid taskId, [FromBody] AgentSayRequest request)
    {
        if (!IsWorkerAuthorized()) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Content)) return BadRequest(new { error = "Content is required." });
        var content = request.Content.Trim();
        var message = await tasks.PostMessageAsync(taskId, content[..Math.Min(content.Length, 4000)]);
        return message is null ? NotFound() : Ok(message);
    }

    [HttpPost("internal/agent-tasks/{taskId:guid}/documents")]
    public async Task<ActionResult<Document>> CreateDocument(Guid taskId, [FromBody] AgentCreateDocumentRequest request)
    {
        if (!IsWorkerAuthorized()) return Unauthorized();
        if (request.Kind is not ("word" or "excel" or "powerpoint"))
            return BadRequest(new { error = "Kind must be word, excel, or powerpoint." });

        var context = await tasks.GetContextAsync(taskId);
        if (context is null) return NotFound();
        var agent = await agentIdentity.EnsureMemberAsync(context.Task.WorkspaceId);
        if (agent is null) return Problem("The agent user is not configured.", statusCode: 503);

        var document = await documents.CreateOfficeDocumentAsync(
            request.Kind, request.FileName, context.Task.WorkspaceId, agent.Id);
        return Created($"/api/documents/{document.Id}", document);
    }

    [HttpPost("internal/agent-tasks/{taskId:guid}/events")]
    public async Task<ActionResult<AgentTaskEventDto>> AppendEvent(Guid taskId, [FromBody] AppendAgentEventRequest request)
    {
        if (!IsWorkerAuthorized()) return Unauthorized();
        var result = await tasks.AppendEventAsync(taskId, request.Type, request.PayloadJson);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("internal/agent-tasks/{taskId:guid}/finish")]
    public async Task<ActionResult<AgentTaskDto>> Finish(Guid taskId, [FromBody] FinishAgentTaskRequest request)
    {
        if (!IsWorkerAuthorized()) return Unauthorized();
        var result = await tasks.FinishAsync(taskId, request.Succeeded, request.Error);
        return result is null ? NotFound() : Ok(result);
    }

    private bool IsWorkerAuthorized()
    {
        var expected = configuration["AgentWorker:ApiKey"];
        var actual = Request.Headers["X-Agent-Worker-Key"].FirstOrDefault();
        return !string.IsNullOrWhiteSpace(expected) && CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(expected),
            System.Text.Encoding.UTF8.GetBytes(actual ?? string.Empty));
    }
}

public record CreateAgentTaskRequest(Guid? DocumentId, string Prompt, Guid? AgentId = null);
public record ClaimAgentTaskRequest(string WorkerId);
public record AppendAgentEventRequest(string Type, string PayloadJson);
public record AgentSayRequest(string Content);
public record AgentCreateDocumentRequest(string Kind, string? FileName = null);
public record FinishAgentTaskRequest(bool Succeeded, string? Error);
