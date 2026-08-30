import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from 'typebox'
import { z } from 'zod'
import type { AgentSkill } from '../types.js'
import { createDriveToolset, createOfficeToolset, type OfficeTool, type ToolContext } from './office-toolset.js'

/**
 * Adapts the shared office toolset into pi's `AgentTool` shape. The definitions
 * live in `office-toolset.ts`, described with Zod.
 *
 * Two things need translating. pi describes parameters with TypeBox rather than
 * Zod, but TypeBox schemas are plain JSON Schema objects at runtime, so Zod 4's
 * own `toJSONSchema` produces something pi accepts. And pi has no `isError` on a
 * tool result — a failing tool is expected to throw — so the flag our handlers
 * return is turned back into one.
 */
/** Providers take the schema as the tool's parameter object, where a `$schema` key has no meaning. */
function parameterSchema(shape: OfficeTool['inputSchema']): TSchema {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(z.object(shape))
  return schema as unknown as TSchema
}

function createReadSkillTool(skills: AgentSkill[]): AgentTool {
  return {
    name: 'read_skill',
    label: 'read_skill',
    description: 'Load the complete instructions for one available skill. Call this when the request matches a skill in the system prompt catalog.',
    parameters: parameterSchema({
      skillId: z.string().describe('The exact skill id from <available_skills>.'),
    }),
    execute: async (_toolCallId: string, params: unknown) => {
      const skillId = (params as { skillId?: unknown } | undefined)?.skillId
      const skill = typeof skillId === 'string' ? skills.find(candidate => candidate.id === skillId) : undefined
      if (!skill) throw new Error('Skill not found or not enabled for this agent. Use an exact id from <available_skills>.')
      const description = skill.description?.trim() ? `\n${skill.description.trim()}` : ''
      return {
        content: [{
          type: 'text',
          text: `# Skill: ${skill.name}\nVersion: ${skill.version}${description}\n\n${skill.instructions}`,
        }],
        details: undefined,
      }
    },
  }
}

export function createPiOfficeTools(context: ToolContext, skills: AgentSkill[]): AgentTool[] {
  return [...adaptTools(createOfficeToolset(context)), createReadSkillTool(skills)]
}

export function createPiDriveTools(taskId: string, skills: AgentSkill[]): AgentTool[] {
  return [...adaptTools(createDriveToolset(taskId)), createReadSkillTool(skills)]
}

function adaptTools(definitions: OfficeTool[]): AgentTool[] {
  return definitions.map(definition => ({
    name: definition.name,
    label: definition.name,
    description: definition.description,
    parameters: parameterSchema(definition.inputSchema),
    execute: async (_toolCallId: string, params: unknown) => {
      const result = await definition.handler((params ?? {}) as Record<string, unknown>)
      const text = result.content
        .map(part => (part.type === 'text' ? part.text : `[${part.type}]`))
        .join('\n')
      if (result.isError) throw new Error(text)
      // pi's content blocks are structurally identical to the toolset's own, so
      // the screenshot from `observe` passes straight through to the model.
      return { content: result.content, details: undefined }
    },
  }))
}
