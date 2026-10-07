import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod/v4'
import { AgentYAMLV3Schema } from '../src/schemas/agent-schema-v3'

/**
 * Every key the agent schema exposes is a promise to whoever authors an agent.
 * A key that parses but is never read is worse than a missing key: the author
 * sets it, sees no change, and blames the agent.
 *
 * So each leaf has to be in exactly one of these two lists. Adding a key to
 * the schema without choosing a list fails this test, and a key only belongs
 * in NOT_IMPLEMENTED once it carries `.describe('Not implemented')` so the
 * console, the JSON schema and the SDK types say so too.
 */
const IMPLEMENTED = [
  '$schema',
  'behavior.acknowledgeTimeGaps',
  'behavior.conversation.cancelPendingOnAck',
  'behavior.conversation.exampleCopy',
  'behavior.conversation.fillerBan',
  'behavior.conversation.namedDelayFollowUp',
  'behavior.conversation.onPolicyRejectExhausted',
  'behavior.conversation.oneMessagePerTurn',
  'behavior.conversation.oneQuestionPerMessage',
  'behavior.conversation.repeatQuestions',
  'behavior.responses.allowSchedule',
  'behavior.responses.allowSilent',
  'behavior.responses.humanize',
  'behavior.responses.maxImmediate',
  'behavior.responses.maxIntermediate',
  'behavior.responses.maxScheduled',
  'behavior.responses.requireFinal',
  'behavior.responses.responseGate.enabled',
  'behavior.responses.responseGate.minAckConfidence',
  'behavior.responses.responseGate.strictMode',
  'behavior.scheduling.defaults.cancelOnActivity',
  'behavior.scheduling.defaults.requiresApproval',
  'behavior.scheduling.defaults.timeWindow',
  'behavior.scheduling.patterns[].defaultDelay.amount',
  'behavior.scheduling.patterns[].defaultDelay.timeWindow',
  'behavior.scheduling.patterns[].defaultDelay.unit',
  'behavior.scheduling.patterns[].description',
  'behavior.scheduling.patterns[].examples[]',
  'behavior.scheduling.patterns[].trigger',
  'behavior.timeGapThreshold',
  'description',
  'handle',
  'name',
  'persona.name',
  'persona.voice.format.maxChars',
  'persona.voice.format.maxQuestionsPerMessage',
  'persona.voice.format.noBulletPoints',
  'persona.voice.format.noEmojis',
  'persona.voice.format.noHyphens',
  'persona.voice.format.noSignOffs',
  'persona.voice.style',
  'policies.messages.schedule.requiresApproval',
  'policies.messages.send.requiresApproval',
  'policies.tools.externalRequiresApproval',
  'policies.tools.systemRequiresApproval',
  'prompts.system',
  'prompts.titleEnrichment.system',
  'prompts.titleEnrichment.user',
  'runtime.model',
  'runtime.personaModel',
  'sandbox.context.contexts[].data',
  'sandbox.context.contexts[].handle',
  'sandbox.context.contexts[].model',
  'sandbox.context.sender.contact.associations',
  'sandbox.context.sender.contact.id',
  'sandbox.context.sender.contact.name',
  'sandbox.context.sender.contact.subscription.channelHandle',
  'sandbox.context.sender.contact.subscription.identifierValue',
  'sandbox.context.sender.displayName',
  'sandbox.context.sender.kind',
  'sandbox.context.sender.permissions[]',
  'sandbox.context.sender.role',
  'sandbox.mockContext.contexts[].data',
  'sandbox.mockContext.contexts[].handle',
  'sandbox.mockContext.contexts[].model',
  'sandbox.mockContext.sender.contact.associations',
  'sandbox.mockContext.sender.contact.id',
  'sandbox.mockContext.sender.contact.name',
  'sandbox.mockContext.sender.contact.subscription.channelHandle',
  'sandbox.mockContext.sender.contact.subscription.identifierValue',
  'sandbox.mockContext.sender.displayName',
  'sandbox.mockContext.sender.kind',
  'sandbox.mockContext.sender.permissions[]',
  'sandbox.mockContext.sender.role',
  'settings[].guidance',
  'settings[].key',
  'settings[].label',
  'settings[].role',
  'skills[]',
  'skills[].alwaysLoad',
  'skills[].description',
  'skills[].skill',
  'skills[].version',
  'skills[].versions[].version',
  'skills[].versions[].weight',
  'timeWindowDefault.prompt',
  'timeWindowDefault.responseMode',
  'timeWindowDefault.scheduleFor',
  'timeWindows',
  'tools[]',
  'tools[].description',
  'tools[].tool',
  'version',
]

const NOT_IMPLEMENTED = [
  'behavior.responses.messageSplitting',
  'events',
  'memory',
  'prompts.followUp',
  'prompts.recovery',
  'sandbox.enabled',
  'skills[].enabled',
  'skills[].instructions',
]

type Leaf = { path: string; markedNotImplemented: boolean }

const NOT_IMPLEMENTED_MARKER = 'Not implemented'

/**
 * Walk to the leaves of a schema, collecting dotted paths. A node marked
 * `Not implemented` is a leaf even when it is an object, because nothing
 * under it is read either.
 */
function collectLeaves(
  schema: z.core.$ZodType,
  path: string,
  leaves: Leaf[] = [],
): Leaf[] {
  const node = schema as z.ZodType
  if (node.description === NOT_IMPLEMENTED_MARKER) {
    leaves.push({ path, markedNotImplemented: true })
    return leaves
  }

  const def = node.def as { type: string } & Record<string, unknown>
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'nonoptional':
    case 'readonly':
      return collectLeaves(def.innerType as z.core.$ZodType, path, leaves)
    case 'object': {
      const shape = (node as unknown as z.ZodObject).shape
      for (const key of Object.keys(shape)) {
        collectLeaves(shape[key], path ? `${path}.${key}` : key, leaves)
      }
      return leaves
    }
    case 'array':
      return collectLeaves(def.element as z.core.$ZodType, `${path}[]`, leaves)
    case 'union': {
      for (const option of def.options as z.core.$ZodType[]) {
        collectLeaves(option, path, leaves)
      }
      return leaves
    }
    default:
      leaves.push({ path, markedNotImplemented: false })
      return leaves
  }
}

test('every agent config key is either implemented or marked not implemented', () => {
  const leaves = collectLeaves(AgentYAMLV3Schema, '')
  const seen = new Set(leaves.map((leaf) => leaf.path))
  const declared = new Set([...IMPLEMENTED, ...NOT_IMPLEMENTED])

  const undeclared = [...seen].filter((path) => !declared.has(path)).sort()
  assert.deepEqual(
    undeclared,
    [],
    `Schema keys missing from this test: add them to IMPLEMENTED once something reads them, or mark them .describe('${NOT_IMPLEMENTED_MARKER}') and add them to NOT_IMPLEMENTED.`,
  )

  const stale = [...declared].filter((path) => !seen.has(path)).sort()
  assert.deepEqual(stale, [], 'Keys listed here are no longer in the schema')
})

test('keys listed as not implemented say so in the schema', () => {
  const marked = new Set(
    collectLeaves(AgentYAMLV3Schema, '')
      .filter((leaf) => leaf.markedNotImplemented)
      .map((leaf) => leaf.path),
  )

  assert.deepEqual([...marked].sort(), [...NOT_IMPLEMENTED].sort())
})

test('conversation policy accepts off, prompt and reject per rule', () => {
  const result = AgentYAMLV3Schema.safeParse({
    handle: 'reminders',
    name: 'Reminders',
    behavior: {
      conversation: {
        repeatQuestions: 'off',
        exampleCopy: 'reject',
        namedDelayFollowUp: 'prompt',
        oneMessagePerTurn: 'off',
        oneQuestionPerMessage: 'reject',
        fillerBan: 'off',
        cancelPendingOnAck: 'prompt',
        onPolicyRejectExhausted: 'skip',
      },
    },
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.behavior?.conversation?.repeatQuestions, 'off')
  assert.equal(result.data.behavior?.conversation?.exampleCopy, 'reject')
  assert.equal(result.data.behavior?.conversation?.oneQuestionPerMessage, 'reject')
})

test('conversation policy rejects a level it cannot enforce', () => {
  const result = AgentYAMLV3Schema.safeParse({
    handle: 'reminders',
    name: 'Reminders',
    behavior: { conversation: { repeatQuestions: 'stop' } },
  })

  assert.equal(result.success, false)
})

test('settings carry the prose and the persona role for an install value', () => {
  const result = AgentYAMLV3Schema.safeParse({
    handle: 'sales',
    name: 'Sales',
    settings: [
      { key: 'MANAGER_NAME', label: 'Manager name', role: 'persona_name' },
      {
        key: 'SELL_PATH',
        label: 'Sell path',
        guidance: 'Once they are qualified, offer {{value}} at {{workplace}}.',
      },
    ],
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.data.settings?.[0]?.role, 'persona_name')
  assert.match(result.data.settings?.[1]?.guidance ?? '', /\{\{workplace\}\}/)
})
