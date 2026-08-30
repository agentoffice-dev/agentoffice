using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AgentOffice.API.Models;
using AgentOffice.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AgentOffice.API.Controllers;

[ApiController, Authorize, Route("api/workspaces/{workspaceId:guid}/agent-schedules")]
public class AgentSchedulesController(IAgentScheduleService schedules) : ControllerBase
{
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);
    [HttpGet] public async Task<ActionResult<IReadOnlyList<AgentScheduleDto>>> List(Guid workspaceId)
        => await schedules.ListAsync(workspaceId, CurrentUserId) is { } value ? Ok(value) : Forbid();
    [HttpPost] public async Task<ActionResult<AgentScheduleDto>> Create(Guid workspaceId, SaveAgentScheduleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Prompt)) return BadRequest(new { error = "Name and prompt are required." });
        return await schedules.CreateAsync(workspaceId, CurrentUserId, request) is { } value ? Ok(value) : Forbid();
    }
    [HttpPut("{id:guid}")] public async Task<ActionResult<AgentScheduleDto>> Update(Guid workspaceId, Guid id, SaveAgentScheduleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Prompt)) return BadRequest(new { error = "Name and prompt are required." });
        return await schedules.UpdateAsync(workspaceId, id, CurrentUserId, request) is { } value ? Ok(value) : NotFound();
    }
    [HttpDelete("{id:guid}")] public async Task<IActionResult> Delete(Guid workspaceId, Guid id)
        => await schedules.DeleteAsync(workspaceId, id, CurrentUserId) is true ? NoContent() : NotFound();
    [HttpPost("{id:guid}/run")] public async Task<ActionResult<AgentTaskDto>> Run(Guid workspaceId, Guid id)
        => await schedules.RunNowAsync(workspaceId, id, CurrentUserId) is { } value ? Ok(value) : NotFound();
}
