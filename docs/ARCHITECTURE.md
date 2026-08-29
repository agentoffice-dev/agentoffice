# Agent Office architecture

Agent Office treats an AI agent as a workspace participant. Human users and agents open the same document through WOPI; the office editor's co-authoring protocol carries document changes between their independent browser sessions.

## Runtime flow

1. A user opens `/editor/{documentId}`. The React page renders the WOPI editor on the left and workspace chat on the right.
2. The user sends a chat message. The client posts the message together with the document that is open, and never dispatches work itself.
3. `ChatService` stores the message and publishes `MessageCreatedEvent`.
4. `AgentChatDispatchHandler` handles that event: a message tagging a workspace agent by name (`@Alice …`, resolved by `AgentDirectoryService`) becomes an `AgentTask` pinned to that agent for the open document; the name-less `/agent` and `@agent` forms still reach the workspace default. Missing prompt, missing document, no configured agent, or missing permission is answered in the chat room by the agent identity instead of failing silently.
5. SignalR publishes chat messages, task status, and tool events to the workspace.
6. The agent worker claims the oldest queued task with its service credential and loads the task context (document, agent profile, skills, recent chat) from `/internal/agent-tasks/{id}/context`.
7. The worker logs in as the configured AI user (the session is cached until the token is close to expiring) and reuses the editor page already open for that document, or creates an isolated Playwright browser context when there is none.
8. On a fresh session the browser opens the same editor route and loads the same document through WOPI. A session that finished its task cleanly is kept open, so the next task on the same document starts at the already-loaded editor; a failed one is closed, because its page is in an unknown state.
9. The worker picks a runtime from the agent profile's provider. `PiAgentRuntime` is the only one it ships: a provider-neutral harness that takes the office toolset as ordinary in-process function tools and resolves its LLM from a `vendor:model` reference on the agent profile, so the same runtime runs on Anthropic, OpenAI or Google. Its credential comes from `model-reference.ts`, which prefers the workspace agent's own key or Claude subscription token over the worker's environment; on Anthropic a subscription token authenticates as Claude Code, which pi-ai does natively.
10. The agent observes, edits, saves, and reports. `save_document` is verified against the WOPI host: the task only reports a save once the document version changed.
11. Every pi `AgentEvent` is translated into a provider-neutral task event vocabulary (`agent.session`, `agent.message`, `agent.tool.use`, `agent.tool.result`, `agent.result`, `agent.error`) and streamed to the workspace, so the chat timeline reads the same whichever vendor pi ran on. The agent's `say` tool posts into the same chat room the request came from.
12. Screenshots (JPEG, since they are sent to the model on every turn) and Playwright traces are written to the artifact volume. Structured task events are stored in the application database.

```
chat message ──► MessageCreatedEvent ──► AgentChatDispatchHandler ──► AgentTask (queued)
                                                                          │
                                    worker claim + context ◄──────────────┘
                                                                          │
     Playwright context ──► /editor/{id} ──► WOPI editor ◄── office tools ─┤
                                                                          │
     SignalR ◄── task events ◄── agent runtime ◄── pi (Anthropic / OpenAI / Google) ┘
```

## Trust boundaries

- The worker API key is accepted only by `/internal/agent-tasks/*` endpoints.
- The AI user has its own login and is added to a workspace only when a member creates a task or an agent has to answer there.
- The agent runtime receives a bounded tool interface. It must not receive the worker API key, user JWTs, WOPI tokens, or a raw CDP endpoint.
- The pi session is constructed with the office tools as its entire toolbox — pi adds no file, shell, or web tools of its own — and is handed only the workspace's own credential, never whatever else the worker environment holds. UI tools resolve selectors inside the editor frame, so an agent cannot drive the surrounding application shell.
- A workspace agent's API key is stored encrypted with ASP.NET Data Protection and is decrypted only for the internal task-context response the worker reads. `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` on the worker are the fallback when a workspace has no configured agent.
- User-provided MCP servers are untrusted. Future MCP execution must use isolated containers, scoped secrets, outbound-network policy, and per-tool grants.
- Skills may compose tools but cannot grant permissions. They are injected as system-prompt sections, never as new capabilities.

## Extension points

`agent-worker/src/runtime/agent-runtime.ts` is the provider boundary. `PiAgentRuntime` is the one implementation, and `BrowserReadyRuntime` the credential-free fallback. `index.ts` selects between them by the workspace agent's provider and the credential it can actually resolve; pi also answers for a profile with no provider set. A further runtime plugs in at the same interface: implement `run()`, add a `static isAvailable`, and add one branch to `selectRuntime`.

`agent-worker/src/runtime/office-toolset.ts` defines the agent-visible tool surface once, provider-neutrally. `office-tools-pi.ts` is the one adapter, converting the Zod shapes to the JSON Schema pi wants. Adding a tool in the toolset adds it to the runtime. The prompt is kept separate too, in `office-instructions.ts`; only the sentence describing how the tools are reached would differ per runtime.

| Tool | Purpose |
|---|---|
| `observe` | Screenshot plus page/frame state, returned to the model as an image |
| `read_document` | Full document text via select-all and clipboard read |
| `write_text` | Type at the caret |
| `press_keys` | Keyboard shortcuts (caret movement, selection, formatting) |
| `inspect_editor_ui` | List real, visible controls in the editor frame |
| `click_editor_ui` / `fill_editor_ui` | Drive editor menus and dialogs by selector |
| `save_document` | Save, then confirm a new document version reached the WOPI host |
| `say` | Post a message into the workspace chat room |

`agent-worker/src/browser/playwright-browser-tool.ts` owns browser lifecycle, the document session cache, and artifacts. Chromium is launched once per worker; editor pages are cached by document id (`AGENT_SESSION_MAX`, LRU) and closed after `AGENT_SESSION_IDLE_MS` of idleness, because an open session keeps holding the document's WOPI lock. Tracing is armed once per context and cut into one chunk per task, kept according to `AGENT_TRACE` (`off` | `failures` | `always`). Interaction pacing — `AGENT_TYPE_DELAY_MS`, `AGENT_KEY_DELAY_MS`, `AGENT_WRITE_SETTLE_MS`, `AGENT_READY_SETTLE_MS`, `AGENT_SCREENSHOT_QUALITY` — is tunable per deployment. Editor-specific knowledge lives in `browser/office-drivers/{collabora,onlyoffice}-driver.ts`, selected with `EDITOR_KIND`; the drivers expose semantic operations while continuing to perform real UI interactions.

The `skills` directory contains versionable operating instructions. Workspace skills stored through the agent resources API are appended to the session system prompt. MCP connection execution remains planned.

## Current vertical slice

- Persistent Agent task and event records
- Server-side chat dispatch: `@<agent name>` tags — and the `/agent` fallback — become tasks through the domain event pipeline
- Internal claim/context/event/message/finish worker API
- SignalR chat, task, and tool-event delivery
- Isolated Playwright browser context per document, reused across consecutive tasks
- Agent account bootstrap and workspace membership
- pi runtime with a bounded in-process office toolset, running on Anthropic, OpenAI or Google per workspace agent
- Document read, edit, and save-with-verification through the editor UI
- Agent replies posted back into the originating chat room
- WOPI iframe observation, screenshot, and trace capture
- Collabora/OnlyOffice drivers and container hostname mapping

## Worker browsing constraints

The worker must load the application from the same origin a person uses. WOPI editors send
`Content-Security-Policy: frame-ancestors`, and Collabora's list covers `localhost:*` only, so a
worker pointed at `http://frontend` gets its editor iframe blocked. The worker therefore sets
`APP_BASE_URL=http://localhost:8788` and maps both host:port pairs onto the container network:

```
EDITOR_HOST_RESOLVER_RULES: "MAP localhost:8788 frontend:80, MAP localhost:9981 collabora:9980"
```

The rules must carry the port. Mapping the bare hostname keeps the original port, which nothing
listens on inside the network.

Document focus is a real mouse click at page coordinates: a `locator.click()` on the editor's
document container is intercepted by its own overlay panes and never lands. The click happens once
per session and is repeated only after a UI tool moves focus away, because every click also moves
the caret the agent just positioned.

Known limits: document text is read through the editor's clipboard (select-all, copy, read), retried
three times because the editor can swallow the first copy after load; an editor build that blocks
clipboard reads returns no text and screenshots remain the fallback. OnlyOffice selectors have had
less exercise than Collabora's. There is no cancel path for a running task yet.
