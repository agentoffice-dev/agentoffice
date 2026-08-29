import { setTimeout as delay } from 'node:timers/promises'
import { workerApi } from './api-client.js'
import type { BrowserSession } from './browser/browser-tool.js'
import { PlaywrightBrowserTool } from './browser/playwright-browser-tool.js'
import { config } from './config.js'
import { type AgentRuntime, BrowserReadyRuntime } from './runtime/agent-runtime.js'
import { officeToolBaseName } from './runtime/office-toolset.js'
import { PiAgentRuntime } from './runtime/pi-agent-runtime.js'
import type { AgentTaskContext } from './types.js'

const browserTool = new PlaywrightBrowserTool()
let stopping = false

function selectRuntime(context: AgentTaskContext): AgentRuntime {
  // pi is the only runtime this worker ships, so it also answers for an agent
  // with no provider set at all.
  if (PiAgentRuntime.isAvailable(context)) return new PiAgentRuntime(browserTool)
  // A workspace that configured an agent and still lands here is misconfigured,
  // not credential-free: say which agent was found and what it was missing.
  const agent = context.agent
  console.warn(agent
    ? `Agent "${agent.name}" (provider=${agent.provider}, authMode=${agent.authMode ?? 'unset'}) has no usable `
      + `credential: apiKey=${agent.apiKey ? 'set' : 'empty'}, oauthToken=${agent.oauthToken ? 'set' : 'empty'}. `
      + `Falling back to the browser-only runtime for task ${context.task.id}.`
    : `No agent is configured for workspace ${context.task.workspaceId} and the worker has no fallback `
      + `credential; using the browser-only runtime for task ${context.task.id}.`)
  return new BrowserReadyRuntime()
}

type RuntimeEvent = { type: string; payload: unknown }

/** How the runtime says the session ended, when it got far enough to say. */
type AgentResult = { subtype?: string; isError?: boolean; result?: string }

function resultOf(events: RuntimeEvent[]): AgentResult | undefined {
  return events.findLast(event => event.type === 'agent.result')?.payload as AgentResult | undefined
}

/** The last assistant message doubles as the chat reply when the agent posted none itself. */
function summarize(events: RuntimeEvent[]): string | undefined {
  const resultText = resultOf(events)?.result?.trim()
  if (resultText) return resultText
  const message = events.findLast(event => event.type === 'agent.message')
  return (message?.payload as { text?: string } | undefined)?.text?.trim()
}

async function processNextTask(): Promise<boolean> {
  const task = await workerApi.claim()
  if (!task) return false

  let session: BrowserSession | undefined
  let saidSomething = false
  let failed = false
  try {
    await workerApi.event(task.id, 'browser.starting', { workerId: config.workerId })
    const taskContext = await workerApi.context(task.id)
    if (!taskContext) throw new Error('The task context could not be loaded')

    if (task.documentId) session = await browserTool.openDocument(task.id, task.documentId)
    const runtime = selectRuntime(taskContext)

    const emitted: RuntimeEvent[] = []
    for await (const event of runtime.run({
      task,
      context: taskContext,
      page: session?.page,
      observation: session?.observation,
    })) {
      emitted.push(event)
      const toolName = (event.payload as { name?: string }).name
      if (event.type === 'agent.tool.use' && toolName && officeToolBaseName(toolName) === 'say')
        saidSomething = true
      await workerApi.event(task.id, event.type, event.payload)
    }

    const summary = summarize(emitted)
    if (!saidSomething && summary) await workerApi.say(task.id, summary).catch(() => undefined)

    const result = resultOf(emitted)
    if (result?.isError) {
      // The agent's own last words already went to the chat room above, so the
      // outcome only has to be recorded on the task. The page is wherever the
      // agent left it — possibly mid-dialog — so the session is not reused.
      failed = true
      await workerApi.finish(task.id, false, result.subtype ?? 'error')
      return true
    }
    await workerApi.finish(task.id, true)
  } catch (error) {
    failed = true
    const message = error instanceof Error ? error.message : String(error)
    await workerApi.event(task.id, 'agent.error', { message }).catch(() => undefined)
    await workerApi.say(task.id, `任務執行失敗：${message}`).catch(() => undefined)
    await workerApi.finish(task.id, false, message).catch(() => undefined)
  } finally {
    // A clean session stays open so the next task on this document skips the
    // whole editor load; a failed one is closed by the browser tool.
    if (session) {
      await browserTool.releaseSession(task.id, task.documentId!, session, failed).catch(() => undefined)
    }
  }
  return true
}

async function main(): Promise<void> {
  await browserTool.start()
  console.log(`Agent worker ${config.workerId} started (editor: ${config.editorKind})`)
  while (!stopping) {
    try {
      if (!await processNextTask()) await delay(config.pollIntervalMs)
    } catch (error) {
      console.error(error)
      await delay(config.pollIntervalMs)
    }
  }
  await browserTool.stop()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true })
}

await main()
