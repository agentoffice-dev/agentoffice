using Microsoft.AspNetCore.SignalR;
using AgentOffice.API.Hubs;
using AgentOffice.API.Models;

namespace AgentOffice.API.Events;

public class AgentTaskCreatedBroadcastHandler(IHubContext<ChatHub> hub) : IEventHandler<AgentTaskCreatedEvent>
{
    public Task HandleAsync(AgentTaskCreatedEvent domainEvent, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(ChatHub.WorkspaceGroup(domainEvent.Task.WorkspaceId))
            .SendAsync("agent.task.created", domainEvent.Task, cancellationToken);
}

public class AgentTaskUpdatedBroadcastHandler(IHubContext<ChatHub> hub) : IEventHandler<AgentTaskUpdatedEvent>
{
    public Task HandleAsync(AgentTaskUpdatedEvent domainEvent, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(ChatHub.WorkspaceGroup(domainEvent.Task.WorkspaceId))
            .SendAsync("agent.task.updated", domainEvent.Task, cancellationToken);
}

public class AgentTaskEventBroadcastHandler(IHubContext<ChatHub> hub) : IEventHandler<AgentTaskEventCreatedEvent>
{
    public Task HandleAsync(AgentTaskEventCreatedEvent domainEvent, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(ChatHub.WorkspaceGroup(domainEvent.WorkspaceId))
            .SendAsync("agent.event.created", domainEvent.Event, cancellationToken);
}
