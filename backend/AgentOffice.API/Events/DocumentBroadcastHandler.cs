using Microsoft.AspNetCore.SignalR;
using AgentOffice.API.Hubs;

namespace AgentOffice.API.Events;

public class DocumentCreatedBroadcastHandler(IHubContext<ChatHub> hub) : IEventHandler<DocumentCreatedEvent>
{
    public Task HandleAsync(DocumentCreatedEvent value, CancellationToken cancellationToken = default) =>
        value.Document.WorkspaceId is Guid workspaceId
            ? hub.Clients.Group(ChatHub.WorkspaceGroup(workspaceId)).SendAsync("document.created", value.Document, cancellationToken)
            : Task.CompletedTask;
}

public class DocumentRenamedBroadcastHandler(IHubContext<ChatHub> hub) : IEventHandler<DocumentRenamedEvent>
{
    public Task HandleAsync(DocumentRenamedEvent value, CancellationToken cancellationToken = default) =>
        value.Document.WorkspaceId is Guid workspaceId
            ? hub.Clients.Group(ChatHub.WorkspaceGroup(workspaceId)).SendAsync("document.renamed", value.Document, cancellationToken)
            : Task.CompletedTask;
}

public class DocumentDeletedBroadcastHandler(IHubContext<ChatHub> hub) : IEventHandler<DocumentDeletedEvent>
{
    public Task HandleAsync(DocumentDeletedEvent value, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(ChatHub.WorkspaceGroup(value.WorkspaceId)).SendAsync("document.deleted", new
        {
            workspaceId = value.WorkspaceId,
            documentId = value.DocumentId,
        }, cancellationToken);
}
