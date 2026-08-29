using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

/// <summary>One agent a chat message tagged, plus the prompt left once the tag is removed.</summary>
public record AgentMentionMatch(WorkspaceAgent Agent, string Prompt);

/// <summary>Looks up the agents of a workspace by the name people type in chat.</summary>
public interface IAgentDirectory
{
    Task<IReadOnlyList<WorkspaceAgent>> ListEnabledAsync(Guid workspaceId);

    /// <summary>The agent a workspace falls back to when a message tags no one in particular.</summary>
    Task<WorkspaceAgent?> DefaultAsync(Guid workspaceId);

    Task<WorkspaceAgent?> FindAsync(Guid workspaceId, Guid agentId);

    /// <summary>Resolves the first `@name` tag in a message, or null when it tags no known agent.</summary>
    Task<AgentMentionMatch?> MatchMentionAsync(Guid workspaceId, string content);
}

public class AgentDirectoryService(AppDbContext db) : IAgentDirectory
{
    /// <summary>Punctuation people type straight after a name; it separates the tag from the prompt.</summary>
    private const string Separators = ":：,，、。.!！?？";

    public async Task<IReadOnlyList<WorkspaceAgent>> ListEnabledAsync(Guid workspaceId) =>
        await db.Agents.Where(agent => agent.WorkspaceId == workspaceId && agent.Enabled)
            .OrderBy(agent => agent.CreatedAt)
            .ToListAsync();

    // Oldest enabled agent wins. Preferring a provider here would make the other
    // providers unreachable in any workspace that also has a Claude agent.
    public async Task<WorkspaceAgent?> DefaultAsync(Guid workspaceId) =>
        (await ListEnabledAsync(workspaceId)).FirstOrDefault();

    public Task<WorkspaceAgent?> FindAsync(Guid workspaceId, Guid agentId) =>
        db.Agents.FirstOrDefaultAsync(agent => agent.Id == agentId && agent.WorkspaceId == workspaceId);

    public async Task<AgentMentionMatch?> MatchMentionAsync(Guid workspaceId, string content)
    {
        var agents = await ListEnabledAsync(workspaceId);
        if (agents.Count == 0) return null;

        // Longest name first: "@Doc Writer" must not be read as "@Doc" followed by a word.
        var byLength = agents.OrderByDescending(agent => agent.Name.Length).ToList();

        for (var at = content.IndexOf('@'); at >= 0; at = content.IndexOf('@', at + 1))
        {
            // A tag starts a word; an e-mail address in the middle of a sentence does not.
            if (at > 0 && !char.IsWhiteSpace(content[at - 1])) continue;

            var rest = content[(at + 1)..];
            var agent = byLength.FirstOrDefault(candidate => IsTagged(rest, candidate.Name));
            if (agent is null) continue;

            var prompt = string.Concat(content[..at], rest[agent.Name.Length..].TrimStart(Separators.ToCharArray()));
            return new AgentMentionMatch(agent, prompt.Trim());
        }

        return null;
    }

    /// <summary>A name is tagged only when the whole name is there and the tag ends after it.</summary>
    private static bool IsTagged(string rest, string name)
    {
        if (name.Length == 0 || !rest.StartsWith(name, StringComparison.OrdinalIgnoreCase)) return false;
        if (rest.Length == name.Length) return true;
        var next = rest[name.Length];
        return char.IsWhiteSpace(next) || Separators.Contains(next);
    }
}
