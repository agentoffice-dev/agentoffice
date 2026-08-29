using AgentOffice.API.Models;

namespace AgentOffice.API.Events;

public record DocumentCreatedEvent(Document Document);
public record DocumentRenamedEvent(Document Document);
public record DocumentDeletedEvent(Guid WorkspaceId, Guid DocumentId);
