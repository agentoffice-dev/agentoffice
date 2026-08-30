import { config } from '../config.js'
import type { AgentTaskContext } from '../types.js'
import type { RuntimeInput } from './agent-runtime.js'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * The rules the runtime hands its model, minus the one sentence that has to
 * change per runtime: how the office tools are reached. pi takes them as plain
 * function tools — and a model that is told the wrong story about its own
 * toolbox goes looking for the document in the wrong place.
 */
function baseInstructions(toolAccessNote: string): string {
  return `You are an AI teammate inside a shared Office workspace. A workspace member
asked you for something in the chat room, and one document is already open in a real browser
session that only you control.

Rules of engagement:
- ${toolAccessNote}
- Start by observing the document (observe, and read_document when the text matters) so that you
  act on what is really there instead of what you assume.
- Make the smallest edit that satisfies the request. Position the caret with press_keys before
  typing, and verify with observe after each edit.
- To reach a passage anywhere in the document — a heading on a later page, a phrase to fix — call
  find_text. It selects the match for you. Never drive the editor's own Find bar with press_keys:
  those keys land in the document, and Enter with text selected replaces that text.
- To change a font, a size, a colour or a paragraph style, select the text (find_text, or press_keys)
  and call format_text. Do not go looking for the matching toolbar control: format_text drives the
  editor directly and takes one call, while a toolbar palette takes several clicks that can each miss.
- You have a limited number of turns. Spend them on the edit rather than on repeated inspection, and
  if a tool keeps failing, change approach or report the obstacle instead of retrying it.
- Call save_document once the edit is complete, and confirm that a new document version appeared.
- When asked to create a separate Word, Excel, or PowerPoint file, call create_document. Its fileName
  is optional; only pass it when the requester specified a name. The new file is created in the current workspace.
- Use the say tool to post a short progress note when a task takes several steps, and to post the
  final summary of what changed. Write in the same language the requester used.
- Never use download, share, print, macro, or external-link actions unless you were explicitly
  asked to. Stop and explain instead of deleting substantial content that was not part of the request.
- If the request cannot be carried out, say so in the chat room with the reason.`
}

/** pi serves the office tools in-process and nothing else. */
export const IN_PROCESS_TOOL_ACCESS = `You interact with the document exclusively through the office tools. There is no filesystem,
  no shell, and no other document — work only in the document that is already open.`

export function buildSystemPrompt(context: AgentTaskContext, toolAccessNote: string): string {
  const sections = [baseInstructions(toolAccessNote)]
  if (!context.document) sections.push(`## Drive task mode
No Office document is open. Ignore all editor-specific rules about observe, reading, editing, formatting,
and saving. Only use the tools actually available in this mode: create_document and say.`)
  if (context.agent?.systemPrompt?.trim()) sections.push(`## Workspace instructions\n${context.agent.systemPrompt.trim()}`)
  if (context.skills.length > 0) {
    const catalog = context.skills.map(skill => [
      '  <skill>',
      `    <id>${escapeXml(skill.id)}</id>`,
      `    <name>${escapeXml(skill.name)}</name>`,
      `    <description>${escapeXml(skill.description?.trim() || 'No description provided.')}</description>`,
      `    <version>${escapeXml(skill.version)}</version>`,
      '  </skill>',
    ].join('\n')).join('\n')
    sections.push(`## Available skills
The following skills provide specialized instructions for specific tasks. When the request matches a
skill's description, call read_skill with its id before acting. Do not claim to have followed a skill
until you have read it. Only the skill catalog is included here; full instructions are loaded on demand.

<available_skills>
${catalog}
</available_skills>`)
  }
  return sections.join('\n\n')
}

/**
 * The task itself. `instructions` is for a runtime with no system-prompt
 * parameter of its own, where the rules have to ride along with the request.
 */
export function buildPrompt(input: RuntimeInput, instructions?: string): string {
  const { context, task } = input
  const history = context.recentMessages
    .slice(-10)
    .map(turn => `${turn.senderName}: ${turn.content}`)
    .join('\n')
  return [
    instructions,
    instructions ? '' : undefined,
    context.document
      ? `Open document: ${context.document.fileName} (${context.document.contentType})`
      : 'Workspace Drive task: no document is open. Use create_document when a new file is requested.',
    `Editor: ${config.editorKind}`,
    history ? `Recent chat in this workspace:\n${history}` : '',
    `\nThe request to carry out now:\n${task.prompt}`,
  ].filter(part => part !== undefined && part !== '').join('\n')
}
