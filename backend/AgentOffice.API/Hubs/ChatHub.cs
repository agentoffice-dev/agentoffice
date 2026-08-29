using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;

namespace AgentOffice.API.Hubs;

[Authorize]
public class ChatHub(AppDbContext db) : Hub
{
    public async Task JoinWorkspace(Guid workspaceId)
    {
        var userId = Guid.Parse(Context.User!.FindFirstValue(JwtRegisteredClaimNames.Sub)!);
        var isMember = await db.WorkspaceUsers.AnyAsync(member =>
            member.WorkspaceId == workspaceId && member.UserId == userId);
        if (!isMember) throw new HubException("You are not a member of this workspace.");
        await Groups.AddToGroupAsync(Context.ConnectionId, WorkspaceGroup(workspaceId));
    }

    public Task LeaveWorkspace(Guid workspaceId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, WorkspaceGroup(workspaceId));

    public static string WorkspaceGroup(Guid workspaceId) => $"workspace:{workspaceId:N}";
}
