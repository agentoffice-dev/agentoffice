import type { AgentResource } from '@/api/agentResources'

/** Punctuation that ends a tag; must stay in step with the API's AgentDirectoryService. */
const SEPARATORS = ':：,，、。.!！?？'

export type MentionDraft = { start: number; query: string }

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The tag being typed at the caret, if any. A tag starts a word, so an e-mail
 * address in the middle of a sentence never opens the picker.
 */
export function mentionDraftAt(text: string, caret: number): MentionDraft | null {
  const upto = text.slice(0, caret)
  const start = upto.lastIndexOf('@')
  if (start < 0) return null
  if (start > 0 && !/\s/.test(upto[start - 1])) return null
  const query = upto.slice(start + 1)
  // Names may contain spaces, so the query does too — but only within one line.
  if (query.includes('\n') || query.length > 60) return null
  return { start, query }
}

/** Agents whose name the half-typed tag could still become. */
export function matchAgents(agents: AgentResource[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return agents
  // A finished tag needs no picker — closing it hands Enter back to sending.
  if (/\s$/.test(query) && agents.some(agent => agent.name.toLowerCase() === needle)) return []
  return agents.filter(agent => agent.name.toLowerCase().startsWith(needle))
}

/** Replaces the half-typed tag with the full name, and reports where the caret lands. */
export function applyMention(text: string, draft: MentionDraft, caret: number, name: string) {
  const tag = `@${name} `
  return { value: text.slice(0, draft.start) + tag + text.slice(caret), caret: draft.start + tag.length }
}

export type MessageSegment = { text: string; agent?: AgentResource }

/** Splits a message so tags of known agents can be rendered as chips. */
export function splitMentions(content: string, agents: AgentResource[]): MessageSegment[] {
  if (agents.length === 0) return [{ text: content }]
  // Longest name first: "@Doc Writer" must not be read as "@Doc" followed by a word.
  const names = [...agents].sort((left, right) => right.name.length - left.name.length)
  const pattern = new RegExp(
    `(^|\\s)@(${names.map(agent => escapeRegExp(agent.name)).join('|')})(?=$|[\\s${escapeRegExp(SEPARATORS)}])`,
    'gi')

  const segments: MessageSegment[] = []
  let last = 0
  for (const match of content.matchAll(pattern)) {
    const at = (match.index ?? 0) + match[1].length
    const agent = agents.find(candidate => candidate.name.toLowerCase() === match[2].toLowerCase())
    if (!agent) continue
    if (at > last) segments.push({ text: content.slice(last, at) })
    segments.push({ text: `@${agent.name}`, agent })
    last = at + 1 + match[2].length
  }
  if (last < content.length) segments.push({ text: content.slice(last) })
  return segments
}
