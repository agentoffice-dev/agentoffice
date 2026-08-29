using System.Text.RegularExpressions;
using AgentOffice.API.Models;
using AgentOffice.API.Services;

namespace AgentOffice.API.Events;

/// <summary>Turns an @agent chat message into work, with or without an open document.</summary>
public partial class AgentChatDispatchHandler(
    IAgentTaskService tasks,
    IChatService chat,
    IAgentIdentity agentIdentity,
    IAgentDirectory directory,
    ILogger<AgentChatDispatchHandler> logger) : IEventHandler<MessageCreatedEvent>
{
    [GeneratedRegex(@"^\s*(?:/agent|@agent)\b[:：,，\s]*", RegexOptions.IgnoreCase)]
    private static partial Regex DefaultMentionPattern();

    public async Task HandleAsync(MessageCreatedEvent domainEvent, CancellationToken cancellationToken = default)
    {
        try { await DispatchAsync(domainEvent.Message); }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to dispatch an agent task for message {MessageId}.", domainEvent.Message.Id);
        }
    }

    private async Task DispatchAsync(ChatMessageDto message)
    {
        if (message.AgentTaskId is not null) return;
        var mention = await directory.MatchMentionAsync(message.WorkspaceId, message.Content);
        var fallback = mention is null ? DefaultMentionPattern().Match(message.Content) : Match.Empty;
        if (mention is null && !fallback.Success) return;

        var identity = await agentIdentity.EnsureMemberAsync(message.WorkspaceId);
        if (identity is null) return;
        if (identity.Id == message.SenderId) return;

        var agent = mention?.Agent ?? await directory.DefaultAsync(message.WorkspaceId);
        if (agent is null)
        {
            await ReplyAsync(message, identity.Id, "目前工作區沒有可用的 Agent，請先到 Agents 頁面設定。");
            return;
        }

        var prompt = (mention?.Prompt ?? message.Content[fallback.Length..]).Trim();
        if (prompt.Length == 0)
        {
            await ReplyAsync(message, identity.Id, $"請在 @{agent.Name} 後面輸入要執行的工作。");
            return;
        }

        var task = await tasks.CreateAsync(message.WorkspaceId, message.DocumentId, message.SenderId, prompt, agent.Id);
        if (task is null)
        {
            await ReplyAsync(message, identity.Id, "無法建立 Agent 任務，請確認你仍是此工作區的成員。");
            return;
        }

        logger.LogInformation("Dispatched agent task {TaskId} to agent {AgentName} from message {MessageId}.",
            task.Id, agent.Name, message.Id);
    }

    private Task ReplyAsync(ChatMessageDto source, Guid agentUserId, string content) =>
        chat.SendAsync(source.WorkspaceId, agentUserId, content, source.DocumentId);
}
