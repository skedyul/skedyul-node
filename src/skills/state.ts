import { z } from 'zod/v4'

/**
 * Field access groups shared by CRM, memory bags, and scratchpad.
 * - track: pull + push, required every turn
 * - own: pull + push
 * - see: pull only
 * - set: push only (not hydrated)
 */
export const SkillFieldGroupSchema = z.object({
  track: z.array(z.string()).optional(),
  own: z.array(z.string()).optional(),
  see: z.array(z.string()).optional(),
  set: z.array(z.string()).optional(),
})

export type SkillFieldGroup = z.infer<typeof SkillFieldGroupSchema>

/** How long a state.memory bag stays reusable. Examples: `10m`, `2h`, `14d`. */
export const SkillStateTtlSchema = z
  .string()
  .regex(/^\d+\s*[smhd]$/, 'ttl must look like 10m, 2h, or 1d')

/**
 * Unified CRM declaration by entity handle.
 * @deprecated Top-level `fields:` is an alias of `state.crm`.
 */
export const SkillFieldsSchema = z.record(z.string(), SkillFieldGroupSchema)

export type SkillFields = z.infer<typeof SkillFieldsSchema>

export const SkillStateCrmSchema = SkillFieldsSchema

export type SkillStateCrm = SkillFields

export const SkillStateMemoryBagSchema = SkillFieldGroupSchema.extend({
  ttl: SkillStateTtlSchema.optional(),
})

export type SkillStateMemoryBag = z.infer<typeof SkillStateMemoryBagSchema>

/** Thread bags keyed by bag id, e.g. `scores`. Harness-owned. */
export const SkillStateMemorySchema = z.record(
  z.string(),
  SkillStateMemoryBagSchema,
)

export type SkillStateMemory = z.infer<typeof SkillStateMemorySchema>

/** Flat key list. Thread-local, model-writable via system:scratchpad:*. */
export const SkillStateScratchpadSchema = SkillFieldGroupSchema

export type SkillStateScratchpad = SkillFieldGroup

/**
 * Durable skill state. CRM is the person record, memory is harness-owned
 * thread scores, scratchpad is model working notes.
 */
export const SkillStateSchema = z.object({
  crm: SkillStateCrmSchema.optional(),
  memory: SkillStateMemorySchema.optional(),
  scratchpad: SkillStateScratchpadSchema.optional(),
})

export type SkillState = z.infer<typeof SkillStateSchema>

export type SkillStateStore = 'crm' | 'memory' | 'scratchpad'

export type ParsedSkillStatePath =
  | { store: 'crm'; scope: string; key: string; path: string }
  | { store: 'memory'; scope: string; key: string; path: string }
  | { store: 'scratchpad'; scope?: undefined; key: string; path: string }

const IDENT = '[A-Za-z_][A-Za-z0-9_]*'
const CRM_PATH = new RegExp(`^state\\.crm\\.(${IDENT})\\.(${IDENT})$`)
const MEMORY_PATH = new RegExp(`^state\\.memory\\.(${IDENT})\\.(${IDENT})$`)
const SCRATCHPAD_PATH = new RegExp(`^state\\.scratchpad\\.(${IDENT})$`)

export function formatSkillStatePath(
  store: SkillStateStore,
  key: string,
  scope?: string,
): string {
  if (store === 'scratchpad') return `state.scratchpad.${key}`
  return `state.${store}.${scope}.${key}`
}

/**
 * Parse `state.<store>.<scope>.<key>` (scratchpad has no extra scope).
 * Returns null when the string is not a state path.
 */
export function parseSkillStatePath(raw: string): ParsedSkillStatePath | null {
  const value = raw.trim()
  const crm = CRM_PATH.exec(value)
  if (crm) {
    return { store: 'crm', scope: crm[1]!, key: crm[2]!, path: value }
  }
  const memory = MEMORY_PATH.exec(value)
  if (memory) {
    return { store: 'memory', scope: memory[1]!, key: memory[2]!, path: value }
  }
  const scratchpad = SCRATCHPAD_PATH.exec(value)
  if (scratchpad) {
    return { store: 'scratchpad', key: scratchpad[1]!, path: value }
  }
  return null
}

/**
 * Routing signal: a state path string, or legacy `{ entity, field }` which
 * means `state.crm.<entity>.<field>`.
 */
export function normalizeRoutingSignal(
  signal: unknown,
): ParsedSkillStatePath | null {
  if (typeof signal === 'string') return parseSkillStatePath(signal)
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return null
  const record = signal as Record<string, unknown>
  if (typeof record.path === 'string') return parseSkillStatePath(record.path)
  if (typeof record.entity === 'string' && typeof record.field === 'string') {
    return parseSkillStatePath(
      formatSkillStatePath('crm', record.field, record.entity),
    )
  }
  return null
}

export type SkillStateAssignKey =
  | { kind: 'path'; parsed: ParsedSkillStatePath }
  | { kind: 'legacy'; field: string }

/**
 * evaluate `assign` keys are full state paths. A bare field name is the
 * deprecated short-key form used with `overrides.applyOn`.
 */
export function parseSkillStateAssignKey(raw: string): SkillStateAssignKey {
  const parsed = parseSkillStatePath(raw)
  if (parsed) return { kind: 'path', parsed }
  return { kind: 'legacy', field: raw.trim() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * `state.crm` wins over deprecated top-level `fields`.
 */
export function crmFieldsFromSkill(config: {
  state?: SkillState | null
  fields?: SkillFields | null
}): SkillFields | undefined {
  return config.state?.crm ?? config.fields ?? undefined
}

export function crmFieldsFromUnknownConfig(config: unknown): SkillFields | undefined {
  if (!isRecord(config)) return undefined
  const state = config.state
  if (isRecord(state) && isRecord(state.crm)) {
    return state.crm as SkillFields
  }
  if (isRecord(config.fields)) {
    return config.fields as SkillFields
  }
  return undefined
}

export function skillStateFromUnknownConfig(config: unknown): SkillState | undefined {
  if (!isRecord(config) || !isRecord(config.state)) return undefined
  const parsed = SkillStateSchema.safeParse(config.state)
  return parsed.success ? parsed.data : undefined
}

export function cleanFieldList(list: string[] | undefined): string[] {
  return (list ?? []).map((field) => field.trim()).filter((field) => field.length > 0)
}

export function hydratedKeysFromGroup(group: SkillFieldGroup | undefined): string[] {
  if (!group) return []
  return [
    ...new Set([
      ...cleanFieldList(group.track),
      ...cleanFieldList(group.own),
      ...cleanFieldList(group.see),
    ]),
  ]
}

export function writableKeysFromGroup(group: SkillFieldGroup | undefined): string[] {
  if (!group) return []
  return [
    ...new Set([
      ...cleanFieldList(group.track),
      ...cleanFieldList(group.own),
      ...cleanFieldList(group.set),
    ]),
  ]
}

export function requiredKeysFromGroup(group: SkillFieldGroup | undefined): string[] {
  return cleanFieldList(group?.track)
}

export type SkillStateMemoryBagDecl = {
  id: string
  ttl?: string
  track: string[]
  own: string[]
  see: string[]
  set: string[]
  hydrated: string[]
  writable: string[]
}

export function memoryBagsFromState(
  state: SkillState | undefined,
): SkillStateMemoryBagDecl[] {
  if (!state?.memory) return []
  return Object.entries(state.memory).map(([id, bag]) => ({
    id,
    ...(bag.ttl ? { ttl: bag.ttl } : {}),
    track: cleanFieldList(bag.track),
    own: cleanFieldList(bag.own),
    see: cleanFieldList(bag.see),
    set: cleanFieldList(bag.set),
    hydrated: hydratedKeysFromGroup(bag),
    writable: writableKeysFromGroup(bag),
  }))
}

export function scratchpadKeysFromState(state: SkillState | undefined): {
  track: string[]
  own: string[]
  see: string[]
  set: string[]
  hydrated: string[]
} {
  const group = state?.scratchpad
  return {
    track: cleanFieldList(group?.track),
    own: cleanFieldList(group?.own),
    see: cleanFieldList(group?.see),
    set: cleanFieldList(group?.set),
    hydrated: hydratedKeysFromGroup(group),
  }
}

/**
 * Nested Liquid context so `{{ state.memory.scores.engagement_score }}` works.
 * Missing keys stay undefined (empty / unset), same as missing settings.
 */
export function skillStateLiquidContext(input: {
  crm?: Record<string, Record<string, unknown>>
  memory?: Record<string, Record<string, unknown>>
  scratchpad?: Record<string, unknown>
}): { state: { crm: Record<string, Record<string, unknown>>; memory: Record<string, Record<string, unknown>>; scratchpad: Record<string, unknown> } } {
  return {
    state: {
      crm: input.crm ?? {},
      memory: input.memory ?? {},
      scratchpad: input.scratchpad ?? {},
    },
  }
}

/**
 * Look up a parsed path. Dual-listed names are not resolved here — callers
 * pass the full path. `intent_score` in both stores is two lookups.
 */
export function lookupSkillStateValue(
  parsed: ParsedSkillStatePath,
  input: {
    crm?: Record<string, Record<string, unknown>>
    memory?: Record<string, Record<string, unknown>>
    scratchpad?: Record<string, unknown>
  },
): unknown {
  if (parsed.store === 'crm') {
    return input.crm?.[parsed.scope]?.[parsed.key]
  }
  if (parsed.store === 'memory') {
    return input.memory?.[parsed.scope]?.[parsed.key]
  }
  return input.scratchpad?.[parsed.key]
}
