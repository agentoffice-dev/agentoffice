# Known issues

Open weaknesses that are understood but not yet addressed. Each entry records what the code does
today, why it matters, and what closing it would take. Fixed entries are removed, not struck through.

## Skills

Skills are text only. `AgentSkillDefinition` (`backend/AgentOffice.API/Models/AgentResources.cs`)
holds a name, description, version and an `Instructions` string; the enabled skills linked to the
answering agent are read in `AgentTaskService.GetContextAsync`
(`backend/AgentOffice.API/Services/AgentTaskService.cs`) and appended to the session system prompt as
`## Skill: …` sections in `buildSystemPrompt` (`agent-worker/src/runtime/office-instructions.ts`).
There is no script, attachment, or bundled-resource path: a skill is authored in the *Skills* tab and
lives only in the database. The worker never calls pi's `loadSkills`, so there is no directory a
skill can be loaded from either. A skill therefore cannot grant a capability: the toolbox is fixed in
`agent-worker/src/runtime/office-toolset.ts` and contains no shell, filesystem, or network tool. The
issues below are about the prompt text itself, not about execution.

### `Instructions` has no size limit

`CreateSkill` / `UpdateSkill` (`backend/AgentOffice.API/Controllers/AgentResourcesController.cs`)
check only that the name and instructions are non-blank. Neither the length of one skill, nor the
number of skills attached to an agent, nor their combined length is bounded. A large skill is copied
into the system prompt of every turn of every task that agent runs, so it inflates latency and token
cost on all of them, and can crowd out the base rules or the document text.

Closing it: a per-skill character cap, a cap on skills per agent, and a combined-length check where
the prompt is assembled, with the API rejecting the write rather than the worker truncating silently.

### Any workspace member can rewrite an agent's instructions

The skill endpoints authorize with `IsMember(workspaceId)`; there is no owner or admin role between a
member and the agent's behaviour. Skill sections are joined *after* the base rules of engagement, and
a later instruction can plausibly override an earlier one, so a member can undo the "never download,
share, print, or use macros" rule, or direct the agent to read the open document and post its
contents into the chat room with `say`, or copy them into a new file with `create_document`.

The blast radius stays inside the workspace — the runtime holds no worker API key, user JWT, WOPI
token, or CDP endpoint, and the agent can only touch the document already open for the task — but
within that workspace a skill is effectively an unreviewed change to how the agent behaves for
everyone.

Closing it: restrict skill writes to a workspace owner/admin role, and treat skill text as untrusted
in the prompt — a delimited, clearly subordinate section that the base rules outrank, rather than a
peer section appended to them.

## MCP

MCP is where executable configuration actually enters the system, and it is not wired up yet.
`McpServer` already persists `Command` and `ArgumentsJson` for a stdio server and an encrypted
credential, but nothing executes them: the task-context DTO returned to the worker carries the task,
document, agent profile, skills and chat history, and no MCP servers at all.

Before that path is implemented, treat user-provided MCP servers as untrusted, per the trust
boundaries in `ARCHITECTURE.md`: isolated containers, scoped secrets, an outbound-network policy, and
per-tool grants.
