import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAgentYAMLV3 } from '../src/schemas/agent-schema-v3'

test('validateAgentYAMLV3 still parses deprecated alwaysLoad on skill bindings', () => {
  const result = validateAgentYAMLV3({
    $schema: 'https://skedyul.com/schemas/agent/v3',
    handle: 'sales',
    name: 'Sales',
    skills: [
      {
        skill: 'sales-qualification',
        alwaysLoad: true,
        description: 'Auto-loaded every turn',
      },
    ],
  })

  assert.equal(result.success, true)
  if (!result.success) return

  const skills = result.data.skills
  assert.equal(skills?.length, 1)
  assert.deepEqual(skills?.[0], {
    skill: 'sales-qualification',
    alwaysLoad: true,
    description: 'Auto-loaded every turn',
  })
})

test('validateAgentYAMLV3 preserves behavior.responses maxImmediate and maxScheduled', () => {
  const result = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    behavior: {
      responses: {
        maxImmediate: 1,
        maxScheduled: 2,
        requireFinal: true,
        allowSchedule: true,
        allowSilent: true,
      },
    },
  })

  assert.equal(result.success, true)
  if (!result.success) return

  assert.deepEqual(result.data.behavior?.responses, {
    maxImmediate: 1,
    maxScheduled: 2,
    requireFinal: true,
    allowSchedule: true,
    allowSilent: true,
  })
})

test('validateAgentYAMLV3 accepts a guidance fallback and one team when', () => {
  const result = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    guidance: {
      prompt: 'Ask the desk when you do not know how to proceed.',
      teams: {
        management: { threadId: 'thd_management' },
        'front-desk': {
          when: 'The customer wants a call or a visit and there is no confirmed time.',
          threadId: 'thd_front_desk',
        },
      },
    },
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.guidance?.teams.management?.when, undefined)
  assert.equal(
    result.data.guidance?.teams['front-desk']?.when,
    'The customer wants a call or a visit and there is no confirmed time.',
  )
})

test('validateAgentYAMLV3 rejects two guidance teams that omit when', () => {
  const result = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    guidance: {
      prompt: 'Ask the desk when you do not know how to proceed.',
      teams: {
        management: { threadId: 'thd_management' },
        owners: { threadId: 'thd_owners' },
      },
    },
  })

  assert.equal(result.success, false)
})
