function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function number(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) ? value : fallback
}

/** How much Playwright tracing costs us: `failures` keeps traces of failed tasks only. */
function traceMode(): 'off' | 'failures' | 'always' {
  const value = (process.env.AGENT_TRACE ?? 'failures').toLowerCase()
  return value === 'off' || value === 'always' ? value : 'failures'
}

export const config = {
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://backend:8080',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://frontend',
  workerApiKey: required('AGENT_WORKER_API_KEY'),
  workerId: process.env.AGENT_WORKER_ID ?? `playwright-${process.pid}`,
  agentEmail: required('AGENT_USER_EMAIL'),
  agentPassword: required('AGENT_USER_PASSWORD'),
  pollIntervalMs: number('AGENT_POLL_INTERVAL_MS', 2000),
  artifactDir: process.env.ARTIFACT_DIR ?? '/artifacts',
  editorKind: (process.env.EDITOR_KIND ?? 'collabora').toLowerCase(),
  editorHostResolverRules: process.env.EDITOR_HOST_RESOLVER_RULES ?? '',
  /*
   * Fallback credentials when the workspace agent has none of its own. pi runs
   * on top of whichever vendor its model names, so one slot per vendor. On
   * Anthropic a `claude setup-token` value stands in for an API key.
   */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  claudeOAuthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  googleApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '',
  /*
   * pi runs on top of a provider the workspace chooses, so its model setting
   * names a vendor as well: `anthropic:claude-opus-5`, `openai:gpt-5.3`,
   * `google:gemini-3-pro`. A bare id is read as Anthropic.
   */
  piModel: process.env.PI_MODEL ?? 'anthropic:claude-opus-5',
  maxTurns: number('AGENT_MAX_TURNS', 30),
  taskTimeoutMs: number('AGENT_TASK_TIMEOUT_MS', 900_000),

  /*
   * Loading an Office document in a browser costs seconds, so an editor page
   * outlives the task that opened it and is reused by the next task on the same
   * document. Set AGENT_SESSION_MAX to 0 to go back to one page per task.
   */
  sessionMax: number('AGENT_SESSION_MAX', 3),
  sessionIdleMs: number('AGENT_SESSION_IDLE_MS', 300_000),
  traceMode: traceMode(),

  /* Interaction pacing. Lower values are faster; too low and the editor drops input. */
  typeDelayMs: number('AGENT_TYPE_DELAY_MS', 4),
  keyPressDelayMs: number('AGENT_KEY_DELAY_MS', 40),
  writeSettleMs: number('AGENT_WRITE_SETTLE_MS', 120),
  /** Upper bound on the wait for the first tile render after the editor loads. */
  readySettleMs: number('AGENT_READY_SETTLE_MS', 1500),
  /** JPEG quality of the screenshots handed to the model. */
  screenshotQuality: number('AGENT_SCREENSHOT_QUALITY', 60),
}
