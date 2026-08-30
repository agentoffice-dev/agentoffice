import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentSkill } from '../types.js'
import { createSkillTool, expandSkillInstructions } from './skill-tool-pi.js'

const skill: AgentSkill = {
  id: 'skill-1',
  name: 'summarize',
  description: 'Summarize the current document.',
  version: '1.2.0',
  instructions: 'Summarize this for $ARGUMENTS. Repeat: $ARGUMENTS',
}

test('expands all $ARGUMENTS placeholders into the loaded skill instructions', () => {
  const result = expandSkillInstructions(skill, 'the finance team')
  assert.match(result, /Summarize this for the finance team\. Repeat: the finance team/)
  assert.match(result, /The skill is now loaded/)
  assert.doesNotMatch(result, /\$ARGUMENTS/)
})

test('Skill resolves names case-insensitively and returns metadata', async () => {
  const tool = createSkillTool([skill])
  const result = await tool.execute('call-1', { skill: '/SUMMARIZE', args: 'executives' })
  assert.equal((result.details as { skillId: string }).skillId, skill.id)
  assert.match((result.content[0] as { text: string }).text, /executives/)
})

test('Skill rejects unavailable and repeatedly loaded skills', async () => {
  const tool = createSkillTool([skill])
  await assert.rejects(() => tool.execute('call-1', { skill: 'missing' }), /Unknown or unavailable/)
  await tool.execute('call-2', { skill: 'summarize' })
  await assert.rejects(() => tool.execute('call-3', { skill: 'summarize' }), /already loaded/)
})

test('Skill rejects ambiguous workspace names', async () => {
  const tool = createSkillTool([skill, { ...skill, id: 'skill-2' }])
  await assert.rejects(() => tool.execute('call-1', { skill: 'summarize' }), /ambiguous/)
})
