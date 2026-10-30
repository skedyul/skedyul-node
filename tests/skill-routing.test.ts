import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAgentYAMLV3,
} from '../src/schemas/agent-schema-v3'
import {
  normalizeRequiresToPredicates,
  resolveFieldsToLegacy,
  skillTurnToolWarnings,
  validateSkillYAML,
} from '../src/skills/types'

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
      guidance:
        'Determine the customer from membership status: {{ state.crm.member.membership_status }}.',
      model: 'openai/gpt-5-nano',
    },
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.deepEqual(result.data.routing, {
    enabled: true,
    fallback: ['sales-qualification'],
    guidance:
      'Determine the customer from membership status: {{ state.crm.member.membership_status }}.',
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

test('validateAgentYAMLV3 strips leftover routing.signals', () => {
  const result = validateAgentYAMLV3({
    ...baseAgent,
    routing: {
      enabled: true,
      signals: [{ entity: 'member', field: 'is_qualified' }],
      guidance: 'Pick from membership status and the message.',
    },
  })
  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal('signals' in (result.data.routing ?? {}), false)
  assert.equal(
    result.data.routing?.guidance,
    'Pick from membership status and the message.',
  )
})

test('validateSkillYAML keeps math evaluate arguments and constants', () => {
  const result = validateSkillYAML({
    handle: 'sales',
    name: 'Sales',
    instructions: 'Score then offer.',
    entityPolicies: { member: ['update'] },
    tools: [
      {
        tool: 'system:math:evaluate',
        arguments: {
          readiness_score: { type: 'number', minimum: 0, maximum: 1 },
          clearance: { type: 'boolean', default: true },
        },
        constants: {
          transparency_weight: 0.6,
          qualified_at: 0.7,
        },
        overrides: {
          expression: 'readiness_score * transparency_weight',
          applyOn: 'app:acme:member:update',
        },
      },
    ],
  })

  assert.equal(result.success, true)
  if (!result.success) return
  const tools = Array.isArray(result.data.tools) ? result.data.tools : []
  assert.deepEqual(tools[0]?.arguments, {
    readiness_score: { type: 'number', minimum: 0, maximum: 1 },
    clearance: { type: 'boolean', default: true },
  })
  assert.deepEqual(tools[0]?.constants, {
    transparency_weight: 0.6,
    qualified_at: 0.7,
  })
  assert.equal(tools[0]?.overrides?.expression, 'readiness_score * transparency_weight')
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

test('validateSkillYAML keeps reply.requires and checks its entity', () => {
  const ok = validateSkillYAML({
    handle: 'onboarding',
    name: 'Onboarding',
    instructions: 'Send next steps.',
    entityPolicies: { member: ['update'] },
    reply: {
      needs: ['client'],
      requires: {
        crm: [{ entity: 'member', field: 'offer_made', op: 'notEmpty' }],
        reason: 'No offer has been made yet.',
      },
    },
  })
  assert.equal(ok.success, true)
  if (ok.success) {
    assert.deepEqual(ok.data.reply, {
      needs: ['client'],
      requires: {
        crm: [{ entity: 'member', field: 'offer_made', op: 'notEmpty' }],
        reason: 'No offer has been made yet.',
      },
    })
  }

  const bad = validateSkillYAML({
    handle: 'onboarding',
    name: 'Onboarding',
    instructions: 'Send next steps.',
    entityPolicies: { member: ['update'] },
    reply: { requires: { crm: [{ entity: 'lead', field: 'stage', op: 'notEmpty' }] } },
  })
  assert.equal(bad.success, false)
  if (!bad.success) {
    assert.deepEqual(bad.error.issues[0]?.path, ['reply', 'requires', 'crm', 0, 'entity'])
  }
})

test('skillTurnToolWarnings flags turn tools a skill declares', () => {
  const warnings = skillTurnToolWarnings({
    tools: [
      { tool: 'app:acme:member:update' },
      { tool: 'system:message:send', description: 'The one reply.' },
      { tool: 'system:message:skip' },
      { tool: 'system:message:cancel' },
    ],
  })
  assert.equal(warnings.length, 2)
  assert.match(warnings[0] ?? '', /system:message:send is a turn tool/)
  assert.match(warnings[1] ?? '', /system:message:skip/)
  assert.deepEqual(skillTurnToolWarnings({ tools: { requires: ['system:message:send'] } }).length, 1)
})

// New entities shape tests
test('validateSkillYAML keeps entities requires (new shape)', () => {
  const result = validateSkillYAML({
    handle: 'closing',
    name: 'Closing',
    instructions: 'Offer the listed pack.',
    entityPolicies: { member: ['get', 'update'] },
    tools: [
      {
        tool: 'app:acme:package:list',
        requires: {
          entities: {
            member: {
              is_qualified: true,
            },
          },
          reason: 'Not qualified yet.',
        },
      },
    ],
  })

  assert.equal(result.success, true)
  if (!result.success) return
  const tools = Array.isArray(result.data.tools) ? result.data.tools : []
  assert.deepEqual(tools[0]?.requires?.entities, {
    member: { is_qualified: true },
  })
})

test('validateSkillYAML rejects entities entity outside entityPolicies', () => {
  const result = validateSkillYAML({
    handle: 'closing',
    name: 'Closing',
    instructions: 'Offer the listed pack.',
    entityPolicies: { member: ['get'] },
    tools: [
      {
        tool: 'app:acme:package:list',
        requires: { entities: { lead: { stage: { notEmpty: true } } } },
      },
    ],
  })

  assert.equal(result.success, false)
  if (result.success) return
  assert.deepEqual(result.error.issues[0]?.path, ['tools', 0, 'requires', 'entities', 'lead'])
})

test('normalizeRequiresToPredicates converts entities to crm predicates', () => {
  const predicates = normalizeRequiresToPredicates({
    entities: {
      member: {
        is_qualified: true,
        sentiment: { notEmpty: true },
      },
    },
  })

  assert.equal(predicates.length, 2)
  assert.deepEqual(predicates[0], { entity: 'member', field: 'is_qualified', op: 'eq', value: true })
  assert.deepEqual(predicates[1], { entity: 'member', field: 'sentiment', op: 'notEmpty' })
})

test('normalizeRequiresToPredicates handles both crm and entities', () => {
  const predicates = normalizeRequiresToPredicates({
    crm: [{ entity: 'member', field: 'stage', op: 'notEmpty' }],
    entities: { member: { is_qualified: true } },
  })

  assert.equal(predicates.length, 2)
  assert.deepEqual(predicates[0], { entity: 'member', field: 'stage', op: 'notEmpty' })
  assert.deepEqual(predicates[1], { entity: 'member', field: 'is_qualified', op: 'eq', value: true })
})

test('normalizeRequiresToPredicates returns empty for undefined', () => {
  assert.deepEqual(normalizeRequiresToPredicates(undefined), [])
})

test('validateSkillYAML keeps reply.requires with entities shape', () => {
  const result = validateSkillYAML({
    handle: 'sales',
    name: 'Sales',
    instructions: 'Score every turn.',
    entityPolicies: { member: ['update'] },
    reply: {
      requires: {
        entities: {
          member: {
            intent_score: { notEmpty: true },
            engagement_level: { notEmpty: true },
            sentiment: { notEmpty: true },
          },
        },
        reason: 'Write scoring before sending.',
      },
    },
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.deepEqual(result.data.reply?.requires?.entities, {
    member: {
      intent_score: { notEmpty: true },
      engagement_level: { notEmpty: true },
      sentiment: { notEmpty: true },
    },
  })
})

test('resolveFieldsToLegacy returns bare owned and required handles', () => {
  const resolved = resolveFieldsToLegacy({
    member: {
      track: ['intent_score', 'sentiment'],
      own: ['stage', 'notes', 'intent_score'],
      see: ['membership_status'],
      set: ['closed_at'],
    },
  })

  assert.deepEqual(resolved.ownedFields, [
    'intent_score',
    'sentiment',
    'stage',
    'notes',
    'closed_at',
  ])
  assert.deepEqual(resolved.requiredWrites, ['intent_score', 'sentiment'])
  assert.deepEqual(resolved.crmContext, {
    models: {
      member: {
        required: ['intent_score', 'sentiment', 'stage', 'notes', 'membership_status'],
      },
    },
  })
})

test('resolveFieldsToLegacy dedupes across entities and skips see-only writes', () => {
  const resolved = resolveFieldsToLegacy({
    member: { own: ['notes'], see: ['membership_status'] },
    booking: { own: ['notes', 'status'] },
  })

  assert.deepEqual(resolved.ownedFields, ['notes', 'status'])
  assert.equal(resolved.requiredWrites, undefined)
  assert.deepEqual(Object.keys(resolved.crmContext?.models ?? {}), ['member', 'booking'])
})

test('resolveFieldsToLegacy returns undefined parts when fields is missing or empty', () => {
  assert.deepEqual(resolveFieldsToLegacy(undefined), {
    crmContext: undefined,
    ownedFields: undefined,
    requiredWrites: undefined,
  })
  assert.deepEqual(resolveFieldsToLegacy({ member: {} }), {
    crmContext: undefined,
    ownedFields: undefined,
    requiredWrites: undefined,
  })
})
