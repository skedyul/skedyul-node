import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAgentRouting,
  validateAgentYAMLV3,
} from '../src/schemas/agent-schema-v3'
import { validateSkillYAML } from '../src/skills/types'

const baseAgent = {
  $schema: 'https://skedyul.com/schemas/agent/v3',
  handle: 'sales',
  name: 'Sales',
  skills: [
    { skill: 'sales-qualification', description: 'Discovery while not qualified.' },
    { skill: 'closing', description: 'Offer once qualified.' },
  ],
}

test('validateAgentYAMLV3 keeps routing', () => {
  const result = validateAgentYAMLV3({
    ...baseAgent,
    routing: {
      enabled: true,
      fallback: ['sales-qualification'],
      signals: [
        { entity: 'member', field: 'membership_status' },
        { entity: 'member', field: 'is_qualified' },
      ],
      guidance: 'is_qualified says whether an offer is allowed yet.',
      model: 'openai/gpt-5-nano',
    },
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.deepEqual(result.data.routing, {
    enabled: true,
    fallback: ['sales-qualification'],
    signals: [
      { entity: 'member', field: 'membership_status' },
      { entity: 'member', field: 'is_qualified' },
    ],
    guidance: 'is_qualified says whether an offer is allowed yet.',
    model: 'openai/gpt-5-nano',
  })
})

test('validateAgentYAMLV3 rejects a fallback that is not a declared skill', () => {
  const result = validateAgentYAMLV3({
    ...baseAgent,
    routing: { enabled: true, fallback: ['nurture'] },
  })

  assert.equal(result.success, false)
  if (result.success) return
  assert.deepEqual(result.error.issues[0]?.path, ['routing', 'fallback', 0])
  assert.match(result.error.issues[0]?.message ?? '', /nurture/)
})

test('validateAgentYAMLV3 rejects routing.enabled with no skills', () => {
  const result = validateAgentYAMLV3({
    handle: 'sales',
    name: 'Sales',
    routing: { enabled: true },
  })

  assert.equal(result.success, false)
})

test('validateAgentRouting checks signal entities when skill entities are known', () => {
  const issues = validateAgentRouting(
    {
      ...baseAgent,
      routing: {
        enabled: true,
        signals: [
          { entity: 'member', field: 'is_qualified' },
          { entity: 'lead', field: 'stage' },
        ],
      },
    },
    new Set(['member']),
  )

  assert.equal(issues.length, 1)
  assert.deepEqual(issues[0]?.path, ['routing', 'signals', 1, 'entity'])
})

test('validateSkillYAML keeps tool requires', () => {
  const result = validateSkillYAML({
    handle: 'closing',
    name: 'Closing',
    instructions: 'Offer the listed pack.',
    entityPolicies: { member: ['get', 'update'] },
    tools: [
      {
        tool: 'app:acme:package:list',
        requires: {
          crm: [{ entity: 'member', field: 'is_qualified', op: 'eq', value: true }],
          reason: 'Not qualified yet.',
        },
      },
    ],
  })

  assert.equal(result.success, true)
  if (!result.success) return
  const tools = Array.isArray(result.data.tools) ? result.data.tools : []
  assert.deepEqual(tools[0]?.requires, {
    crm: [{ entity: 'member', field: 'is_qualified', op: 'eq', value: true }],
    reason: 'Not qualified yet.',
  })
})

test('validateSkillYAML rejects a requires entity outside entityPolicies', () => {
  const result = validateSkillYAML({
    handle: 'closing',
    name: 'Closing',
    instructions: 'Offer the listed pack.',
    entityPolicies: { member: ['get'] },
    tools: [
      {
        tool: 'app:acme:package:list',
        requires: { crm: [{ entity: 'lead', field: 'stage', op: 'notEmpty' }] },
      },
    ],
  })

  assert.equal(result.success, false)
  if (result.success) return
  assert.deepEqual(result.error.issues[0]?.path, ['tools', 0, 'requires', 'crm', 0, 'entity'])
})

test('validateSkillYAML rejects eq without a value and in without an array', () => {
  const result = validateSkillYAML({
    handle: 'closing',
    name: 'Closing',
    instructions: 'Offer the listed pack.',
    entityPolicies: { member: ['get'] },
    tools: [
      {
        tool: 'app:acme:package:list',
        requires: {
          crm: [
            { entity: 'member', field: 'is_qualified', op: 'eq' },
            { entity: 'member', field: 'membership_status', op: 'in', value: 'prospect' },
          ],
        },
      },
    ],
  })

  assert.equal(result.success, false)
  if (result.success) return
  assert.equal(result.error.issues.length, 2)
})
