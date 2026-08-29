namespace AgentOffice.API.Events;

public interface IEventHandler<in TEvent>
{
    Task HandleAsync(TEvent domainEvent, CancellationToken cancellationToken = default);
}

public interface IEventPublisher
{
    Task PublishAsync<TEvent>(TEvent domainEvent, CancellationToken cancellationToken = default);
}

public class EventPublisher(IServiceProvider services) : IEventPublisher
{
    // Handlers run sequentially: several of them touch the request-scoped
    // DbContext, which does not allow concurrent operations.
    public async Task PublishAsync<TEvent>(TEvent domainEvent, CancellationToken cancellationToken = default)
    {
        foreach (var handler in services.GetServices<IEventHandler<TEvent>>())
            await handler.HandleAsync(domainEvent, cancellationToken);
    }
}
