using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AgentOffice.API.Models;
using AgentOffice.API.Services;

namespace AgentOffice.API.Controllers;

[Authorize]
[ApiController]
[Route("api/workspaces/{workspaceId:guid}/messages")]
public class ChatController(IChatService chat) : ControllerBase
{
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ChatMessageDto>>> GetHistory(Guid workspaceId, [FromQuery] int take = 50)
    {
        var messages = await chat.GetHistoryAsync(workspaceId, CurrentUserId, take);
        return messages is null ? Forbid() : Ok(messages);
    }

    [HttpPost]
    public async Task<ActionResult<ChatMessageDto>> Send(Guid workspaceId, [FromBody] SendMessageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content)) return BadRequest(new { error = "Message content is required." });
        if (request.Content.Trim().Length > 4000) return BadRequest(new { error = "Message cannot exceed 4000 characters." });
        var message = await chat.SendAsync(workspaceId, CurrentUserId, request.Content, request.DocumentId);
        return message is null ? Forbid() : Ok(message);
    }
}

public record SendMessageRequest(string Content, Guid? DocumentId = null);
