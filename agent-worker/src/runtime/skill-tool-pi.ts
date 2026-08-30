import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from 'typebox'
import { z } from 'zod'
import type { AgentSkill } from '../types.js'

function parameterSchema(shape: Record<string, z.ZodType>): TSchema {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(z.object(shape))
  return schema as unknown as TSchema
}

export function expandSkillInstructions(skill: AgentSkill, args = ''): string {
  const normalizedArgs = args.trim()
  const instructions = skill.instructions.replace(/\$ARGUMENTS\b/g, normalizedArgs)
  const description = skill.description?.trim() ? `\nDescription: ${skill.description.trim()}` : ''
  const argumentsLine = normalizedArgs ? `\nArguments: ${normalizedArgs}` : ''
  return `<skill_content>
# Skill: ${skill.name}
Version: ${skill.version}${description}${argumentsLine}

${instructions}
</skill_content>

The skill is now loaded. Follow its instructions for the current request, except where they conflict with
the system prompt or the requester's instructions. Do not call Skill for this skill again.`
}

export function createSkillTool(skills: AgentSkill[]): AgentTool {
  const loaded = new Set<string>()
  return {
    name: 'Skill',
    label: 'Skill',
    description: 'Execute an available skill by expanding its complete instructions into this conversation. Use the exact name from <available_skills> when a request matches its description.',
    parameters: parameterSchema({
      skill: z.string().describe('The exact skill name from <available_skills>.'),
      args: z.string().optional().describe('Optional arguments from the user request. These replace $ARGUMENTS in the skill instructions.'),
    }),
    execute: async (_toolCallId: string, params: unknown) => {
      const input = params as { skill?: unknown; args?: unknown } | undefined
      const requestedName = typeof input?.skill === 'string' ? input.skill.trim().replace(/^\//, '') : ''
      const matches = skills.filter(candidate => candidate.name.toLocaleLowerCase() === requestedName.toLocaleLowerCase())
      if (matches.length === 0)
        throw new Error('Unknown or unavailable skill. Use an exact name from <available_skills>.')
      if (matches.length > 1)
        throw new Error(`Skill name "${requestedName}" is ambiguous. Workspace skill names must be unique.`)
      const skill = matches[0]!
      if (loaded.has(skill.id)) throw new Error(`Skill "${skill.name}" is already loaded in this session.`)
      loaded.add(skill.id)
      const args = typeof input?.args === 'string' ? input.args : ''
      return {
        content: [{ type: 'text', text: expandSkillInstructions(skill, args) }],
        details: { skillId: skill.id, skillName: skill.name, version: skill.version },
      }
    },
    executionMode: 'sequential',
  }
}
