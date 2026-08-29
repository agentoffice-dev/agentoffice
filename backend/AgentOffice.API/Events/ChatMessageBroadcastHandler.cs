using Microsoft.AspNetCore.SignalR;
using AgentOffice.API.Hubs;
using AgentOffice.API.Models;

namespace AgentOffice.API.Events;

public class ChatMessageBroadcastHandler(IHubContext<ChatHub> hub) : IEventHandler<MessageCreatedEvent>
{
    public Task HandleAsync(MessageCreatedEvent domainEvent, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(ChatHub.WorkspaceGroup(domainEvent.Message.WorkspaceId))
            .SendAsync("message.created", domainEvent.Message, cancellationToken);
}
