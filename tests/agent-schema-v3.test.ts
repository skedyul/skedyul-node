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

test('validateAgentYAMLV3 accepts collaboration and defaults a missing blocking flag', () => {
  const result = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    collaboration: {
      threadId: '{{ MANAGEMENT_THREAD_ID }}',
      fallback: {
        prompt: 'You still do not know what to do. Ask the team, then tell the member.',
      },
      scenarios: {
        phone_call: {
          prompt: 'The member wants a call. Ask the team before offering a time.',
          blocking: true,
        },
        successful_conversion: {
          prompt: 'A prospect converted. Tell the team they are coming in.',
          blocking: false,
        },
      },
    },
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.collaboration?.fallback.blocking, undefined)
  assert.equal(result.data.collaboration?.scenarios?.phone_call?.blocking, true)
  assert.equal(result.data.collaboration?.scenarios?.successful_conversion?.blocking, false)
})

test('validateAgentYAMLV3 rejects a non-boolean blocking flag', () => {
  const result = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    collaboration: {
      threadId: 'thd_management',
      fallback: { prompt: 'Ask the team.', blocking: 'staff' },
    },
  })

  assert.equal(result.success, false)
})

test('validateAgentYAMLV3 rejects guidance and consultations', () => {
  const guidance = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    guidance: {
      prompt: 'Ask the desk.',
      teams: { management: { threadId: 'thd_management' } },
    },
  })
  const consultations = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    consultations: [
      {
        handle: 'front-desk',
        threadId: 'thd_front',
        when: 'A call.',
        never: 'A price.',
      },
    ],
  })

  assert.equal(guidance.success, false)
  assert.equal(consultations.success, false)
  if (guidance.success || consultations.success) return
  assert.match(guidance.error.issues[0]?.message ?? '', /collaboration/)
  assert.match(consultations.error.issues[0]?.message ?? '', /collaboration/)
})
