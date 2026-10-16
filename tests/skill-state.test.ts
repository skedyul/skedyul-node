import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSkillStatePath,
  formatSkillStatePath,
  normalizeRoutingSignal,
  parseSkillStateAssignKey,
  crmFieldsFromSkill,
  skillStateLiquidContext,
  lookupSkillStateValue,
  memoryBagsFromState,
  SkillYAMLSchema,
  validateSkillYAML,
  normalizeRequiresToPathPredicates,
  resolveSkillCrmFields,
} from '../src/skills/types'
import { validateAgentYAMLV3 } from '../src/schemas/agent-schema-v3'

test('parseSkillStatePath accepts crm, memory, and scratchpad paths', () => {
  assert.deepEqual(parseSkillStatePath('state.crm.member.intent_score'), {
    store: 'crm',
    scope: 'member',
    key: 'intent_score',
    path: 'state.crm.member.intent_score',
  })
  assert.deepEqual(parseSkillStatePath('state.memory.scores.engagement_score'), {
    store: 'memory',
    scope: 'scores',
    key: 'engagement_score',
    path: 'state.memory.scores.engagement_score',
  })
  assert.deepEqual(parseSkillStatePath('state.scratchpad.plan'), {
    store: 'scratchpad',
    key: 'plan',
    path: 'state.scratchpad.plan',
  })
  assert.equal(parseSkillStatePath('member.intent_score'), null)
  assert.equal(parseSkillStatePath('state.crm.member'), null)
})

test('formatSkillStatePath round-trips', () => {
  assert.equal(
    formatSkillStatePath('crm', 'intent_score', 'member'),
    'state.crm.member.intent_score',
  )
  assert.equal(
    formatSkillStatePath('scratchpad', 'pending_question'),
    'state.scratchpad.pending_question',
  )
})

test('normalizeRoutingSignal accepts a path or legacy { entity, field }', () => {
  assert.equal(
    normalizeRoutingSignal('state.memory.scores.readiness_score')?.path,
    'state.memory.scores.readiness_score',
  )
  assert.deepEqual(normalizeRoutingSignal({ entity: 'member', field: 'stage' }), {
    store: 'crm',
    scope: 'member',
    key: 'stage',
    path: 'state.crm.member.stage',
  })
  assert.equal(normalizeRoutingSignal({ entity: 'member' }), null)
})

test('parseSkillStateAssignKey treats bare names as legacy', () => {
  assert.equal(
    parseSkillStateAssignKey('state.crm.member.is_qualified').kind,
    'path',
  )
  assert.deepEqual(parseSkillStateAssignKey('intent_score'), {
    kind: 'legacy',
    field: 'intent_score',
  })
})

test('SkillYAMLSchema keeps state.crm, state.memory, and state.scratchpad', () => {
  const parsed = SkillYAMLSchema.parse({
    handle: 'sales',
    name: 'Sales',
    instructions: 'Q={{ state.memory.scores.intent_score }}',
    state: {
      crm: {
        member: {
          track: ['intent_score', 'engagement_level'],
          own: ['stage', 'is_qualified'],
          see: ['membership_status'],
          set: ['closed_at'],
        },
      },
      memory: {
        scores: {
          ttl: '14d',
          track: [
            'engagement_score',
            'transparency_score',
            'readiness_score',
            'intent_score',
          ],
        },
      },
      scratchpad: {
        own: ['plan', 'pending_question'],
      },
    },
  })
  assert.equal(parsed.state?.memory?.scores?.ttl, '14d')
  assert.deepEqual(parsed.state?.scratchpad?.own, ['plan', 'pending_question'])
  assert.deepEqual(
    crmFieldsFromSkill(parsed)?.member?.track,
    ['intent_score', 'engagement_level'],
  )
})

test('crmFieldsFromSkill prefers state.crm over deprecated fields', () => {
  assert.deepEqual(
    crmFieldsFromSkill({
      state: { crm: { member: { track: ['intent_score'] } } },
      fields: { member: { track: ['sentiment'] } },
    })?.member?.track,
    ['intent_score'],
  )
  assert.deepEqual(
    crmFieldsFromSkill({
      fields: { member: { track: ['sentiment'] } },
    })?.member?.track,
    ['sentiment'],
  )
})

test('resolveSkillCrmFields derives owned and required from state.crm', () => {
  const resolved = resolveSkillCrmFields({
    state: {
      crm: {
        member: {
          track: ['intent_score', 'sentiment'],
          own: ['stage'],
          see: ['membership_status'],
          set: ['closed_at'],
        },
      },
    },
  })
  assert.deepEqual(resolved.requiredWrites, ['intent_score', 'sentiment'])
  assert.deepEqual(resolved.ownedFields, [
    'intent_score',
    'sentiment',
    'stage',
    'closed_at',
  ])
})

test('validateSkillYAML keeps path requires and full-path assign', () => {
  const result = validateSkillYAML({
    handle: 'sales',
    name: 'Sales',
    instructions: 'Score then offer.',
    entityPolicies: { member: ['update'], package: ['list'] },
    tools: [
      {
        tool: 'system:math:evaluate',
        overrides: {
          expression: 'readiness_score',
          assign: {
            'state.memory.scores.intent_score': '$value',
            'state.crm.member.intent_score': '$value',
            'state.crm.member.is_qualified': '$value >= qualified_threshold',
          },
        },
      },
      {
        tool: 'app:acme:package:list',
        requires: {
          path: [
            { path: 'state.crm.member.is_qualified', op: 'eq', value: true },
          ],
          reason: 'Not qualified yet.',
        },
      },
    ],
  })
  assert.equal(result.success, true)
  if (!result.success) return
  const tools = Array.isArray(result.data.tools) ? result.data.tools : []
  assert.equal(
    (tools[0]?.overrides as { assign?: Record<string, string> })?.assign?.[
      'state.memory.scores.intent_score'
    ],
    '$value',
  )
  assert.deepEqual(tools[1]?.requires?.path, [
    { path: 'state.crm.member.is_qualified', op: 'eq', value: true },
  ])
})

test('validateSkillYAML rejects a CRM path outside entityPolicies', () => {
  const result = validateSkillYAML({
    handle: 'sales',
    name: 'Sales',
    instructions: 'x',
    entityPolicies: { member: ['get'] },
    tools: [
      {
        tool: 'app:acme:package:list',
        requires: {
          path: [{ path: 'state.crm.lead.stage', op: 'notEmpty' }],
        },
      },
    ],
  })
  assert.equal(result.success, false)
})

test('validateSkillYAML allows memory paths without entityPolicies', () => {
  const result = validateSkillYAML({
    handle: 'sales',
    name: 'Sales',
    instructions: 'x',
    tools: [
      {
        tool: 'system:math:evaluate',
        requires: {
          path: [
            { path: 'state.memory.scores.engagement_score', op: 'notEmpty' },
          ],
        },
      },
    ],
  })
  assert.equal(result.success, true)
})

test('normalizeRequiresToPathPredicates converts crm, entities, and path', () => {
  const predicates = normalizeRequiresToPathPredicates({
    path: [{ path: 'state.memory.scores.intent_score', op: 'notEmpty' }],
    crm: [{ entity: 'member', field: 'stage', op: 'notEmpty' }],
    entities: { member: { is_qualified: true } },
  })
  assert.deepEqual(predicates, [
    { path: 'state.memory.scores.intent_score', op: 'notEmpty' },
    { path: 'state.crm.member.stage', op: 'notEmpty' },
    { path: 'state.crm.member.is_qualified', op: 'eq', value: true },
  ])
})

test('validateAgentYAMLV3 keeps Liquid routing guidance', () => {
  const result = validateAgentYAMLV3({
    $schema: 'https://skedyul.com/schemas/agent/v3',
    handle: 'sales',
    name: 'Sales',
    skills: [{ skill: 'sales-qualification', description: 'Discover.' }],
    routing: {
      enabled: true,
      guidance:
        'Determine the customer from membership status: {{ state.crm.member.membership_status }}.',
    },
  })
  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(
    result.data.routing?.guidance,
    'Determine the customer from membership status: {{ state.crm.member.membership_status }}.',
  )
})

test('skillStateLiquidContext and lookupSkillStateValue read nested stores', () => {
  const ctx = skillStateLiquidContext({
    crm: { member: { intent_score: 0.79 } },
    memory: { scores: { engagement_score: 0.8, intent_score: 0.76 } },
    scratchpad: { plan: 'ask timing' },
  })
  assert.equal(ctx.state.memory.scores.engagement_score, 0.8)
  assert.equal(
    lookupSkillStateValue(parseSkillStatePath('state.memory.scores.intent_score')!, {
      memory: ctx.state.memory,
      crm: ctx.state.crm,
    }),
    0.76,
  )
  assert.equal(
    lookupSkillStateValue(parseSkillStatePath('state.crm.member.intent_score')!, {
      crm: ctx.state.crm,
    }),
    0.79,
  )
})

test('memoryBagsFromState lists bag ids, ttl, and track keys', () => {
  const bags = memoryBagsFromState({
    memory: {
      scores: {
        ttl: '14d',
        track: ['engagement_score', 'intent_score'],
      },
    },
  })
  assert.equal(bags.length, 1)
  assert.equal(bags[0]?.id, 'scores')
  assert.equal(bags[0]?.ttl, '14d')
  assert.deepEqual(bags[0]?.track, ['engagement_score', 'intent_score'])
})
