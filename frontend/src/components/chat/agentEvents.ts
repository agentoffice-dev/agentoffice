import type { AgentTaskEvent } from '@/api/agentTasks'
import type { TFunction } from 'i18next'

export type DescribedAgentEvent = { icon: string; text: string; tone?: 'error' }

function parse(event: AgentTaskEvent): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(event.payloadJson)
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function toolLabel(rawName: unknown, t: TFunction): string {
  const name = String(rawName ?? '').split('__').pop() ?? ''
  const key = `agentEvent.tools.${name}`
  const translated = t(key)
  return translated === key ? name : translated
}

/** Turns a raw task event into one readable timeline line, or null when it adds nothing. */
export function describeAgentEvent(event: AgentTaskEvent, t: TFunction): DescribedAgentEvent | null {
  const payload = parse(event)

  switch (event.type) {
    case 'browser.starting':
      return { icon: '🖥️', text: t('agentEvent.browserStarting') }
    case 'browser.ready':
      return { icon: '📄', text: t('agentEvent.browserReady', { title: String(payload.title ?? '') }).trim() }
    case 'agent.session':
      return { icon: '🤖', text: t('agentEvent.session', { model: String(payload.model ?? 'default model') }) }
    case 'agent.message': {
      const text = String(payload.text ?? '').trim()
      return text ? { icon: '💬', text: text.length > 240 ? `${text.slice(0, 240)}…` : text } : null
    }
    case 'agent.tool.use':
      return { icon: '🛠️', text: toolLabel(payload.name, t) }
    case 'agent.tool.result':
      return payload.isError === true
        ? { icon: '⚠️', text: String(payload.text ?? t('agentEvent.toolFailed')).slice(0, 200), tone: 'error' }
        : null
    case 'agent.result': {
      if (payload.isError !== true) return { icon: '✅', text: t('agentEvent.completed', { turns: String(payload.numTurns ?? '?') }) }
      // `subtype` is the SDK's own outcome ("success" means the query ran), not
      // the task's — showing it here reads as a contradiction. Show the reason.
      const reason = String(payload.result ?? '').trim()
      return { icon: '⚠️', text: reason ? t('agentEvent.incomplete', { reason: reason.slice(0, 200) }) : t('agentEvent.unsuccessful'), tone: 'error' }
    }
    case 'agent.error':
      return { icon: '⚠️', text: String(payload.message ?? t('agentEvent.unknown')), tone: 'error' }
    default:
      return { icon: '•', text: event.type }
  }
}
