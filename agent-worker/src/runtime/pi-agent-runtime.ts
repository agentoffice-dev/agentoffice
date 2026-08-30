import { Agent, type AgentEvent } from '@earendil-works/pi-agent-core'
import { type Api, type Model } from '@earendil-works/pi-ai'
import { builtinModels, builtinProviders } from '@earendil-works/pi-ai/providers/all'
import { config } from '../config.js'
import type { PlaywrightBrowserTool } from '../browser/playwright-browser-tool.js'
import type { AgentTaskContext } from '../types.js'
import type { AgentRuntime, RuntimeEvent, RuntimeInput } from './agent-runtime.js'
import { formatModelRef, modelRefForAgent, resolveVendorKey, type ModelRef } from './model-reference.js'
import { buildPrompt, buildSystemPrompt, IN_PROCESS_TOOL_ACCESS } from './office-instructions.js'
import { createPiDriveTools, createPiOfficeTools } from './office-tools-pi.js'

const PROVIDERS = new Set<string>(builtinProviders().map(provider => provider.id))

function modelRef(context: AgentTaskContext): ModelRef {
  return modelRefForAgent(context)
}

/**
 * pi routes every request through a `Models` collection, so the provider for the
 * chosen vendor is registered before the model id is looked up in its catalogue.
 */
function resolveModel(ref: ModelRef): { model: Model<Api>; streamFn: ReturnType<typeof builtinModels>['streamSimple'] } {
  const models = builtinModels()
  const model = models.getModel(ref.vendor, ref.id)
  if (!model) {
    throw new Error(`pi has no model "${ref.id}" for provider "${ref.vendor}"; `
      + 'the id must be one pi-ai publishes, for example anthropic:claude-opus-5.')
  }
  return { model, streamFn: models.streamSimple.bind(models) }
}

/**
 * Turns pi's push-based `subscribe` into the pull-based iterable the worker
 * consumes. Events that arrive while nobody is awaiting are buffered, so a burst
 * during a tool call is not dropped.
 */
class EventQueue<T> {
  private readonly buffer: T[] = []
  private waiting?: (value: IteratorResult<T>) => void
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const waiting = this.waiting
    if (waiting) {
      this.waiting = undefined
      waiting({ value: item, done: false })
      return
    }
    this.buffer.push(item)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    const waiting = this.waiting
    if (waiting) {
      this.waiting = undefined
      waiting({ value: undefined as never, done: true })
    }
  }

  async *drain(): AsyncIterable<T> {
    while (true) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as T
        continue
      }
      if (this.closed) return
      const next = await new Promise<IteratorResult<T>>(resolve => { this.waiting = resolve })
      if (next.done) return
      yield next.value
    }
  }
}

/** Carried across one session's events so the finished task can report what it did. */
type RunProgress = { turns: number }

function resultText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content
  if (!Array.isArray(content)) return typeof result === 'string' ? result : ''
  return content.map(part => (part.type === 'text' ? part.text ?? '' : `[${part.type}]`)).join('\n')
}

function messageText(message: unknown): string {
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part: { type?: string }) => part?.type === 'text')
    .map((part: { text?: string }) => part.text ?? '')
    .join('')
}

/** Streams one pi agent session and translates it into workspace task events. */
export class PiAgentRuntime implements AgentRuntime {
  constructor(private readonly browser: PlaywrightBrowserTool) {}

  static isAvailable(context: AgentTaskContext): boolean {
    // pi is the only runtime this worker ships, so an agent that never had a
    // provider written on it — the historical default — lands here too.
    const provider = context.agent?.provider
    return Boolean(provider && PROVIDERS.has(provider))
  }

  async *run(input: RuntimeInput): AsyncIterable<RuntimeEvent> {
    const { task, context, page, observation } = input
    if (observation) yield { type: 'browser.ready', payload: observation }

    const ref = modelRef(context)
    // pi-ai reads a Claude subscription token out of the same slot as an API key:
    // an `sk-ant-oat` value switches its Anthropic client to Bearer auth.
    const apiKey = resolveVendorKey(ref.vendor, context)
    const { model, streamFn } = resolveModel(ref)
    const maxTurns = context.agent?.maxTurns ?? config.maxTurns
    const progress: RunProgress = { turns: 0 }

    const agent = new Agent({
      initialState: {
        systemPrompt: buildSystemPrompt(context, IN_PROCESS_TOOL_ACCESS),
        model,
        tools: page
          ? createPiOfficeTools({ browser: this.browser, page, taskId: task.id }, context.skills)
          : createPiDriveTools(task.id, context.skills),
      },
      streamFn,
      // The workspace's own key, never whatever the worker happens to hold in its
      // environment on behalf of another agent.
      // Undefined lets pi-ai resolve ambient credentials (AWS, ADC, env vars).
      getApiKey: () => apiKey || undefined,
      shouldStopAfterTurn: () => progress.turns >= maxTurns,
    })

    const queue = new EventQueue<AgentEvent>()
    const unsubscribe = agent.subscribe(event => { queue.push(event) })

    const timeoutSeconds = context.agent?.timeoutSeconds ?? Math.round(config.taskTimeoutMs / 1000)
    const timeout = setTimeout(() => agent.abort(), timeoutSeconds * 1000)

    yield { type: 'agent.session', payload: { model: formatModelRef(ref) } }

    // The prompt is what fills the queue, so it is started but not awaited here;
    // the loop below drains events until pi closes the run.
    let failure: unknown
    const finished = agent.prompt(buildPrompt(input))
      .catch(error => { failure = error })
      .finally(() => queue.close())

    try {
      for await (const event of queue.drain()) yield* this.toEvents(event, progress)
      await finished
    } finally {
      clearTimeout(timeout)
      unsubscribe()
    }

    if (failure !== undefined) {
      const message = failure instanceof Error ? failure.message : String(failure)
      yield { type: 'agent.error', payload: { message } }
      yield { type: 'agent.result', payload: { subtype: 'error', isError: true, result: message } }
      return
    }

    // A turn that was aborted — the timeout above — or that failed inside the
    // provider is reported on the state rather than as an event.
    const errorMessage = agent.state.errorMessage
    yield errorMessage
      ? { type: 'agent.result', payload: { subtype: 'error', isError: true, result: errorMessage } }
      : { type: 'agent.result', payload: { subtype: 'success', isError: false, numTurns: progress.turns } }
  }

  private *toEvents(event: AgentEvent, progress: RunProgress): Iterable<RuntimeEvent> {
    switch (event.type) {
      case 'turn_end':
        progress.turns += 1
        return

      case 'message_end': {
        const text = messageText(event.message).trim()
        if (text) yield { type: 'agent.message', payload: { text } }
        return
      }

      case 'tool_execution_start':
        yield {
          type: 'agent.tool.use',
          payload: { id: event.toolCallId, name: event.toolName, input: event.args },
        }
        return

      case 'tool_execution_end':
        yield {
          type: 'agent.tool.result',
          payload: {
            id: event.toolCallId,
            isError: event.isError,
            text: resultText(event.result).slice(0, 2000),
          },
        }
        return

      default:
        return
    }
  }
}
