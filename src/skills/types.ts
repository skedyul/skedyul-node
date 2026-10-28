import { z } from 'zod/v4'
import { PublicListingSchema } from '../schemas/public-listing'
import {
  SkillFieldsSchema,
  SkillStateSchema,
  crmFieldsFromSkill,
  parseSkillStatePath,
  type SkillFields,
  type SkillState,
} from './state'

export {
  SkillFieldGroupSchema,
  SkillFieldsSchema,
  SkillStateCrmSchema,
  SkillStateMemoryBagSchema,
  SkillStateMemorySchema,
  SkillStateScratchpadSchema,
  SkillStateSchema,
  SkillStateTtlSchema,
  parseSkillStatePath,
  formatSkillStatePath,
  normalizeRoutingSignal,
  parseSkillStateAssignKey,
  crmFieldsFromSkill,
  crmFieldsFromUnknownConfig,
  skillStateFromUnknownConfig,
  memoryBagsFromState,
  scratchpadKeysFromState,
  skillStateLiquidContext,
  lookupSkillStateValue,
  hydratedKeysFromGroup,
  writableKeysFromGroup,
  requiredKeysFromGroup,
  type SkillFieldGroup,
  type SkillFields,
  type SkillState,
  type SkillStateCrm,
  type SkillStateMemory,
  type SkillStateMemoryBag,
  type SkillStateScratchpad,
  type SkillStateStore,
  type ParsedSkillStatePath,
  type SkillStateAssignKey,
  type SkillStateMemoryBagDecl,
} from './state'

/**
 * Skill YAML schema versions
 */
export const SKILL_SCHEMA_VERSION = 'https://skedyul.com/schemas/skill/v1'
export const SKILL_SCHEMA_VERSION_V2 = 'https://skedyul.com/schemas/skill/v2'

/**
 * Skill source - where the skill comes from
 */
export const SkillSourceSchema = z.enum(['BUILTIN', 'S3', 'APP', 'EXTERNAL'])

export type SkillSource = z.infer<typeof SkillSourceSchema>

/**
 * Skill tool requirement (v1 - legacy)
 * @deprecated Use SkillToolDefinitionSchema for v2 skills
 */
export const SkillToolRequirementSchema = z.object({
  requires: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
})

export type SkillToolRequirement = z.infer<typeof SkillToolRequirementSchema>

/**
 * Sandbox configuration for skill tools
 */
export const SkillToolSandboxSchema = z.object({
  mock: z.unknown().optional(),
})

export type SkillToolSandbox = z.infer<typeof SkillToolSandboxSchema>

/**
 * Tool constraints configuration for execution limits and categorization.
 * Used to control how tools are executed at runtime.
 */
export const ToolConstraintsSchema = z.object({
  maxCallsPerRun: z.number().optional(),
  idempotent: z.boolean().optional(),
  restricted: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
})

export type ToolConstraints = z.infer<typeof ToolConstraintsSchema>

/**
 * CRM predicate ops, shared by evaluator preconditions and tool gates.
 * `eq` and `in` compare a value; `empty` and `notEmpty` take none.
 */
export const CrmPredicateOpSchema = z.enum(['eq', 'in', 'empty', 'notEmpty'])

export type CrmPredicateOp = z.infer<typeof CrmPredicateOpSchema>

/**
 * One CRM condition on a named entity, e.g. member.is_qualified eq true.
 * `entity` is a handle from the skill's `entityPolicies`.
 */
export const EntityCrmPredicateSchema = z.object({
  entity: z.string().min(1),
  field: z.string().min(1),
  op: CrmPredicateOpSchema,
  value: z.unknown().optional(),
})

export type EntityCrmPredicate = z.infer<typeof EntityCrmPredicateSchema>

/**
 * Field constraint in the new entities shape.
 * - Primitive value (string, number, boolean): exact match (op: eq)
 * - `{ notEmpty: true }`: field must have a value (op: notEmpty)
 */
export const EntityFieldConstraintSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ notEmpty: z.literal(true) }),
])

export type EntityFieldConstraint = z.infer<typeof EntityFieldConstraintSchema>

/**
 * New declarative shape for tool/reply requires.
 * Maps entity handle -> field handle -> constraint.
 *
 * Example:
 * ```yaml
 * entities:
 *   member:
 *     is_qualified: true
 *     sentiment: { notEmpty: true }
 * ```
 */
export const EntitiesRequiresSchema = z.record(
  z.string(), // entity handle
  z.record(z.string(), EntityFieldConstraintSchema), // field -> constraint
)

export type EntitiesRequires = z.infer<typeof EntitiesRequiresSchema>

/**
 * One condition on a dotted state path, e.g.
 * `state.crm.member.is_qualified` or `state.memory.scores.engagement_score`.
 */
export const SkillStatePathPredicateSchema = z.object({
  path: z.string().min(1),
  op: CrmPredicateOpSchema,
  value: z.unknown().optional(),
})

export type SkillStatePathPredicate = z.infer<typeof SkillStatePathPredicateSchema>

/**
 * Conditions a tool call needs. The harness checks every predicate
 * against the turn-start CRM / memory / scratchpad context and rejects
 * the call with `reason` when one fails, so the model is steered instead
 * of the run failing.
 *
 * Supports:
 * - `path`: array of `{ path, op, value }` state-path predicates
 * - Legacy `crm`: array of EntityCrmPredicate objects (`state.crm.<entity>.<field>`)
 * - `entities`: declarative map of entity.field constraints
 */
export const SkillToolRequiresSchema = z.object({
  path: z.array(SkillStatePathPredicateSchema).optional(),
  crm: z.array(EntityCrmPredicateSchema).optional(),
  entities: EntitiesRequiresSchema.optional(),
  reason: z.string().optional(),
})

export type SkillToolRequires = z.infer<typeof SkillToolRequiresSchema>

function entityPredicateFromPath(
  predicate: SkillStatePathPredicate,
): EntityCrmPredicate | null {
  const parsed = parseSkillStatePath(predicate.path)
  if (!parsed || parsed.store !== 'crm') return null
  return {
    entity: parsed.scope,
    field: parsed.key,
    op: predicate.op,
    ...(predicate.value !== undefined ? { value: predicate.value } : {}),
  }
}

/**
 * Normalize a SkillToolRequires to crm predicates array.
 * Converts `entities` and CRM `path` entries to `{ entity, field }` predicates.
 * Memory and scratchpad paths are omitted — use `normalizeRequiresToPathPredicates`.
 */
export function normalizeRequiresToPredicates(
  requires: SkillToolRequires | undefined,
): EntityCrmPredicate[] {
  if (!requires) return []

  const predicates: EntityCrmPredicate[] = []

  // Add existing crm predicates
  if (requires.crm) {
    predicates.push(...requires.crm)
  }

  // Convert entities shape to predicates
  if (requires.entities) {
    for (const [entity, fields] of Object.entries(requires.entities)) {
      for (const [field, constraint] of Object.entries(fields)) {
        if (
          typeof constraint === 'object' &&
          constraint !== null &&
          'notEmpty' in constraint
        ) {
          predicates.push({ entity, field, op: 'notEmpty' })
        } else {
          predicates.push({ entity, field, op: 'eq', value: constraint })
        }
      }
    }
  }

  for (const predicate of requires.path ?? []) {
    const crm = entityPredicateFromPath(predicate)
    if (crm) predicates.push(crm)
  }

  return predicates
}

/**
 * Normalize every requires shape to `{ path, op, value }` predicates.
 * `{ entity, field }` and `entities` become `state.crm.<entity>.<field>`.
 */
export function normalizeRequiresToPathPredicates(
  requires: SkillToolRequires | undefined,
): SkillStatePathPredicate[] {
  if (!requires) return []
  const predicates: SkillStatePathPredicate[] = []
  for (const predicate of requires.path ?? []) {
    predicates.push(predicate)
  }
  for (const predicate of requires.crm ?? []) {
    predicates.push({
      path: `state.crm.${predicate.entity}.${predicate.field}`,
      op: predicate.op,
      ...(predicate.value !== undefined ? { value: predicate.value } : {}),
    })
  }
  if (requires.entities) {
    for (const [entity, fields] of Object.entries(requires.entities)) {
      for (const [field, constraint] of Object.entries(fields)) {
        if (
          typeof constraint === 'object' &&
          constraint !== null &&
          'notEmpty' in constraint
        ) {
          predicates.push({
            path: `state.crm.${entity}.${field}`,
            op: 'notEmpty',
          })
        } else {
          predicates.push({
            path: `state.crm.${entity}.${field}`,
            op: 'eq',
            value: constraint,
          })
        }
      }
    }
  }
  return predicates
}

/**
 * One named argument on a skill tool (JSON Schema property).
 * Becomes the model-facing input schema for tools such as system:math:evaluate.
 */
export const SkillToolArgumentSchema = z.object({
  type: z.enum(['number', 'boolean', 'string', 'integer']),
  description: z.string().optional(),
  default: z.union([z.number(), z.boolean(), z.string()]).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
})

export type SkillToolArgument = z.infer<typeof SkillToolArgumentSchema>

/**
 * Full tool definition owned by a skill (v2)
 * Skills own their tools with full configuration including descriptions,
 * overrides, sandbox mocks, approval settings, and execution constraints.
 */
export const SkillToolDefinitionSchema = z.object({
  tool: z.string(),
  description: z.string().optional(),
  /**
   * Named arguments the model fills. For system:math:evaluate this is the
   * JSON Schema the playground shows (not a free-form scope bag).
   */
  arguments: z.record(z.string(), SkillToolArgumentSchema).optional(),
  /**
   * Numbers the model never sees. Merged into math.evaluate scope so formulas
   * have no magic numbers. A colliding argument name loses to the constant.
   */
  constants: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  sandbox: SkillToolSandboxSchema.optional(),
  requiresApproval: z.boolean().optional(),
  constraints: ToolConstraintsSchema.optional(),
  /**
   * CRM list field handles to hydrate. When set on a list tool, list
   * results include these fields. Omit to hydrate every field.
   */
  fields: z.array(z.string().min(1)).optional(),
  /**
   * Memory ids that must already be filled before this tool may run.
   * Each id is an immediate dependency. Confirm needs a reservation;
   * it does not itself call reserve.
   */
  needs: z.array(z.string().min(1)).optional(),
  /** CRM conditions checked before the call runs. */
  requires: SkillToolRequiresSchema.optional(),
})

export type SkillToolDefinition = z.infer<typeof SkillToolDefinitionSchema>

/**
 * Tools configuration - supports both v1 (requires array) and v2 (full definitions)
 */
export const SkillToolsSchema = z.union([
  SkillToolRequirementSchema,
  z.array(SkillToolDefinitionSchema),
])

/**
 * Skill example - few-shot learning example
 */
export const SkillExampleSchema = z.object({
  context: z.string().optional(),
  input: z.string(),
  reasoning: z.string().optional(),
  output: z.string(),
  tool_call: z.string().optional(),
})

export type SkillExample = z.infer<typeof SkillExampleSchema>

/**
 * Field requirements for a CRM model in skill context.
 * - required: Fields that MUST have a value or agent will fail (ERROR)
 * - recommended: Fields that SHOULD have a value for optimal performance (WARNING)
 * - Fields not listed are optional (no validation)
 */
export const CRMModelFieldRequirementsSchema = z.object({
  required: z.array(z.string()).optional(),
  recommended: z.array(z.string()).optional(),
})

export type CRMModelFieldRequirements = z.infer<typeof CRMModelFieldRequirementsSchema>

/**
 * CRM context configuration - specifies which models and fields to include
 * in the CRM schema when loading this skill, with requirement levels.
 *
 * Example:
 * ```yaml
 * crmContext:
 *   models:
 *     prospect:
 *       required:
 *         - stage
 *         - intent_score
 *       recommended:
 *         - goals
 *         - desired_frequency
 * ```
 */
export const CRMContextSchema = z.object({
  models: z.record(z.string(), CRMModelFieldRequirementsSchema),
})

export type CRMContext = z.infer<typeof CRMContextSchema>

/**
 * Derive crmContext, ownedFields, requiredWrites from unified fields shape.
 * Used by harness when `state.crm` or deprecated `fields` is present.
 *
 * `crmContext.models` is keyed by entity handle; callers that fetch CRM
 * schema map entity handles to CRM model handles. `ownedFields` and
 * `requiredWrites` are bare field handles because CRM write gates compare
 * the bare keys of an update payload.
 */
export function resolveFieldsToLegacy(fields: SkillFields | undefined): {
  crmContext: CRMContext | undefined
  ownedFields: string[] | undefined
  requiredWrites: string[] | undefined
} {
  if (!fields) {
    return { crmContext: undefined, ownedFields: undefined, requiredWrites: undefined }
  }

  const models: Record<string, { required?: string[]; recommended?: string[] }> = {}
  const ownedFields = new Set<string>()
  const requiredWrites = new Set<string>()
  const clean = (list: string[] | undefined): string[] =>
    (list ?? []).map((f) => f.trim()).filter((f) => f.length > 0)

  for (const [entity, groups] of Object.entries(fields)) {
    const track = clean(groups.track)
    const own = clean(groups.own)
    const see = clean(groups.see)
    const set = clean(groups.set)
    const hydrated = [...new Set([...track, ...own, ...see])]

    if (hydrated.length > 0) {
      models[entity] = { required: hydrated }
    }
    for (const field of [...track, ...own, ...set]) ownedFields.add(field)
    for (const field of track) requiredWrites.add(field)
  }

  return {
    crmContext: Object.keys(models).length > 0 ? { models } : undefined,
    ownedFields: ownedFields.size > 0 ? [...ownedFields] : undefined,
    requiredWrites: requiredWrites.size > 0 ? [...requiredWrites] : undefined,
  }
}

/** Resolve CRM groups from `state.crm`, falling back to deprecated `fields`. */
export function resolveSkillCrmFields(config: {
  state?: SkillState | null
  fields?: SkillFields | null
}): ReturnType<typeof resolveFieldsToLegacy> {
  return resolveFieldsToLegacy(crmFieldsFromSkill(config))
}

/**
 * Entity operation types for entity policies.
 * These map to CRM operations at runtime via AppCrmMap.
 */
export const EntityOperationSchema = z.enum(['get', 'list', 'update', 'create', 'delete'])

export type EntityOperation = z.infer<typeof EntityOperationSchema>

/**
 * Entity policies configuration - declares which entity operations a skill needs.
 * At runtime, these are resolved to CRM tools via AppCrmMap.
 *
 * Example:
 * ```yaml
 * entityPolicies:
 *   member:
 *     - get
 *     - update
 *   booking:
 *     - list
 *     - create
 * ```
 */
export const EntityPoliciesSchema = z.record(
  z.string(), // entity handle (e.g., "member", "booking")
  z.array(EntityOperationSchema) // allowed operations
)

export type EntityPolicies = z.infer<typeof EntityPoliciesSchema>

/**
 * How long a memory entry stays reusable. Examples: `10m`, `2h`, `1d`.
 */
export const SkillMemoryTtlSchema = z
  .string()
  .regex(/^\d+\s*[smhd]$/, 'ttl must look like 10m, 2h, or 1d')

/**
 * One AgentMemory entry the harness fills before a dependent tool or reply
 * can run. `tool` fills it when the tool succeeds. When `entity` and `match`
 * are set, a mapped CRM instance with that match value and a remote id fills
 * it first.
 */
export const SkillMemorySchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  ttl: SkillMemoryTtlSchema,
  entity: z.string().min(1).optional(),
  match: z.string().min(1).optional(),
})

export type SkillMemory = z.infer<typeof SkillMemorySchema>

/**
 * The skill's contract on the turn's one reply. The send itself belongs to
 * the platform; every loaded skill's contract must pass before it goes out.
 *
 * - `needs`: memory ids that must be filled. Omit when the skill never sends
 *   a message, such as an admin booking.
 * - `requires`: CRM conditions on an `entityPolicies` entity, checked against
 *   the turn-start record. A failure rejects the send with `reason`.
 */
export const SkillReplySchema = z.object({
  needs: z.array(z.string().min(1)).optional(),
  requires: SkillToolRequiresSchema.optional(),
})

export type SkillReply = z.infer<typeof SkillReplySchema>

/**
 * Full Skill YAML schema (supports both v1 and v2)
 * 
 * v1: tools is SkillToolRequirementSchema ({ requires: [...] })
 * v2: tools is array of SkillToolDefinitionSchema (full tool ownership)
 */
export const EvaluatorPreconditionsSchema = z.object({
  toolSucceeded: z.boolean().optional(),
  anyWrittenFields: z.array(z.string()).optional(),
  noneOfWrittenFields: z.array(z.string()).optional(),
  crm: z
    .array(
      z.object({
        field: z.string(),
        op: CrmPredicateOpSchema,
        value: z.unknown().optional(),
      }),
    )
    .optional(),
  skillsLoaded: z.array(z.string()).optional(),
  skillsNotLoaded: z.array(z.string()).optional(),
})

export type EvaluatorPreconditions = z.infer<typeof EvaluatorPreconditionsSchema>

export const SkillEvaluatorSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  target: z.enum(['message', 'tool', 'entity']),
  selector: z.string().optional(),
  criteria: z.string(),
  passThreshold: z.number().optional(),
  checks: z
    .object({
      requiredArgs: z.array(z.string()).optional(),
      forbiddenArgValues: z.record(z.string(), z.array(z.unknown())).optional(),
    })
    .optional(),
  preconditions: EvaluatorPreconditionsSchema.optional(),
})

export type SkillEvaluator = z.infer<typeof SkillEvaluatorSchema>

/**
 * An install-scoped value this skill reads by key, e.g. `WIN_CRITERIA`.
 *
 * It loads with the agent's settings, so the install page and playground
 * set it like any other setting. The skill's own text references it with
 * Liquid (`{{ WIN_CRITERIA }}`); the agent prompt and other skills cannot.
 * The skill can also reference every setting the agent declares.
 */
export const SkillSettingSchema = z.object({
  /** Setting key, resolved against the install's AgentConfig and env. */
  key: z.string().min(1),
  /** Human label shown in the console and to the grader. */
  label: z.string().optional(),
  /** Value used when the install leaves the setting blank. */
  default: z.string().optional(),
})

export type SkillSetting = z.infer<typeof SkillSettingSchema>

export const SkillYAMLSchema = z.object({
  // Schema version
  $schema: z.string().optional(),

  // Identity
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  /** Copy for a public website. Not the instructions. */
  public: PublicListingSchema.optional(),

  // Instructions injected into agent system prompt
  instructions: z.string(),

  // Entity policies - declares which entity operations this skill needs
  // At runtime, these are resolved to CRM tools via AppCrmMap
  entityPolicies: EntityPoliciesSchema.optional(),

  // Tool configuration - supports both v1 and v2 formats
  // Use for non-entity tools (MCP tools, system tools)
  tools: SkillToolsSchema.optional(),

  // CRM context - specifies which models/fields to include in schema
  crmContext: CRMContextSchema.optional(),

  /**
   * Durable skill state. `crm` is the person record, `memory` is harness-owned
   * thread scores, `scratchpad` is model working notes. Same track/own/see/set
   * verbs; the parent key is the store.
   */
  state: SkillStateSchema.optional(),

  /**
   * @deprecated Use `state.crm`. Parsed as an alias of `state.crm` when
   * `state.crm` is omitted.
   */
  fields: SkillFieldsSchema.optional(),

  /**
   * Entity field handles this skill is allowed to write while loaded.
   * Writing outside this list is reported as an unowned write.
   * @deprecated Use fields.{entity}.own or fields.{entity}.set instead.
   */
  ownedFields: z.array(z.string()).optional(),

  /**
   * Entity field handles this skill must have written before it replies.
   * Only handles mapped in the install's AppCrmMap are enforced.
   * @deprecated Use fields.{entity}.track instead.
   */
  requiredWrites: z.array(z.string()).optional(),

  // Quality evaluators owned by this skill
  evaluators: z.array(SkillEvaluatorSchema).optional(),

  /**
   * Thread AgentMemory entries. The harness fills each one from a mapped CRM
   * instance or from a successful call to `tool`. Stored as `memory:<id>`.
   */
  memory: z.array(SkillMemorySchema).optional(),

  /** Memory ids required before system:message:send. */
  reply: SkillReplySchema.optional(),

  /** Install-scoped settings only this skill references. */
  settings: z.array(SkillSettingSchema).optional(),

  // Few-shot examples
  examples: z.array(SkillExampleSchema).optional(),
})

export type SkillYAML = z.infer<typeof SkillYAMLSchema>

/**
 * Skill YAML v2 schema - explicit v2 with tool ownership
 * Use this when you want to enforce v2 format with full tool definitions.
 */
export const SkillYAMLV2Schema = z.object({
  $schema: z.literal(SKILL_SCHEMA_VERSION_V2).optional(),
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  /** Copy for a public website. Not the instructions. */
  public: PublicListingSchema.optional(),
  instructions: z.string(),
  entityPolicies: EntityPoliciesSchema.optional(),
  tools: z.array(SkillToolDefinitionSchema).optional(),
  crmContext: CRMContextSchema.optional(),
  state: SkillStateSchema.optional(),
  fields: SkillFieldsSchema.optional(),
  ownedFields: z.array(z.string()).optional(),
  requiredWrites: z.array(z.string()).optional(),
  evaluators: z.array(SkillEvaluatorSchema).optional(),
  memory: z.array(SkillMemorySchema).optional(),
  reply: SkillReplySchema.optional(),
  settings: z.array(SkillSettingSchema).optional(),
  examples: z.array(SkillExampleSchema).optional(),
})

export type SkillYAMLV2 = z.infer<typeof SkillYAMLV2Schema>

/**
 * Version weight for A/B testing
 */
export const SkillVersionWeightSchema = z.object({
  version: z.number(),
  weight: z.number(),
})

export type SkillVersionWeight = z.infer<typeof SkillVersionWeightSchema>

/**
 * Skill reference in agent YAML - can be a string handle or object with version config
 */
export const SkillRefSchema = z.union([
  z.string(), // Just handle - uses latest published version
  z.object({
    skill: z.string(),
    description: z.string().optional(), // For AI SDK Agent Skills discovery
    /**
     * Pre-seed this skill as loaded before the first model step, so the agent
     * does not have to call system:skill:load for it.
     */
    alwaysLoad: z.boolean().optional(),
    // Version selection (pick one):
    version: z.number().optional(), // Pin to specific version number
    versions: z.array(SkillVersionWeightSchema).optional(), // A/B testing weights
    /**
     * @deprecated Not implemented. Instructions come from the skill file.
     */
    instructions: z.string().optional().describe('Not implemented'),
    /**
     * @deprecated Not implemented. Remove the skill from `skills` instead.
     */
    enabled: z.boolean().optional().describe('Not implemented'),
  }),
])

export type SkillRef = z.infer<typeof SkillRefSchema>

/**
 * Skill metadata (for registry)
 */
export const SkillMetadataSchema = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  source: SkillSourceSchema,
  s3Key: z.string().optional(),
  appVersionId: z.string().optional(),
  workplaceId: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>

/**
 * Resolved skill - loaded and ready for injection.
 * Tools are represented as string names for backward compatibility with IR.
 * Use LoadedSkill for runtime skill loading with full tool definitions.
 */
export const ResolvedSkillSchema = z.object({
  handle: z.string(),
  name: z.string(),
  instructions: z.string().optional(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  examples: z.array(SkillExampleSchema).optional(),
})

export type ResolvedSkill = z.infer<typeof ResolvedSkillSchema>

/**
 * Loaded skill - skill loaded at runtime with full tool definitions.
 * Used by SkillToolRegistry for dynamic tool registration.
 */
export const LoadedSkillSchema = z.object({
  handle: z.string(),
  name: z.string(),
  instructions: z.string().optional(),
  description: z.string().optional(),
  entityPolicies: EntityPoliciesSchema.optional(),
  tools: z.array(SkillToolDefinitionSchema).optional(),
  state: SkillStateSchema.optional(),
  fields: SkillFieldsSchema.optional(),
  memory: z.array(SkillMemorySchema).optional(),
  reply: SkillReplySchema.optional(),
  examples: z.array(SkillExampleSchema).optional(),
})

export type LoadedSkill = z.infer<typeof LoadedSkillSchema>

/**
 * Helper to check if skill tools are v2 format (array of tool definitions)
 */
export function isV2SkillTools(
  tools: SkillToolRequirement | SkillToolDefinition[] | undefined
): tools is SkillToolDefinition[] {
  if (!tools) return false
  return Array.isArray(tools)
}

/**
 * Helper to extract tool names from either v1 or v2 format
 */
export function getSkillToolNames(
  tools: SkillToolRequirement | SkillToolDefinition[] | undefined
): string[] {
  if (!tools) return []
  if (isV2SkillTools(tools)) {
    return tools.map((t) => t.tool)
  }
  return tools.requires || []
}

/**
 * Helper to convert v1 tool requirements to v2 tool definitions
 * Used during migration or when loading legacy skills
 */
export function convertV1ToV2Tools(
  requires: string[]
): SkillToolDefinition[] {
  return requires.map((tool) => ({ tool }))
}

/**
 * Skill discovery metadata - minimal info for system prompt
 * Following AI SDK Agent Skills pattern: only name + description at startup
 */
export interface SkillDiscoveryInfo {
  handle: string
  name: string
  description: string
}

/**
 * Helper function to define a skill with type safety
 */
export function defineSkill(skill: SkillYAML): SkillYAML {
  return SkillYAMLSchema.parse(skill)
}

/**
 * Validate a skill YAML object
 */
export function validateSkillYAML(skill: unknown): { success: true; data: SkillYAML } | { success: false; error: z.ZodError } {
  const result = SkillYAMLSchema.safeParse(skill)
  if (!result.success) {
    return { success: false, error: result.error }
  }
  const requiresIssues = validateSkillToolRequires(result.data)
  if (requiresIssues.length > 0) {
    return {
      success: false,
      error: new z.ZodError(
        requiresIssues.map((issue) => ({
          code: 'custom' as const,
          path: issue.path,
          message: issue.message,
          input: undefined,
        })),
      ),
    }
  }
  return { success: true, data: result.data }
}

/**
 * Every `tools[].requires` and `reply.requires` predicate must be well-formed.
 * CRM paths / `{ entity, field }` must name an entity from `entityPolicies`,
 * and `eq` / `in` need a value (`in` an array). Memory and scratchpad paths
 * skip the entityPolicies check.
 */
export function validateSkillToolRequires(
  skill: Pick<SkillYAML, 'tools' | 'entityPolicies' | 'reply'>,
): { path: (string | number)[]; message: string }[] {
  const entities = new Set(Object.keys(skill.entityPolicies ?? {}))
  const issues: { path: (string | number)[]; message: string }[] = []

  const checkOp = (
    owner: string,
    op: CrmPredicateOp,
    value: unknown,
    at: (string | number)[],
  ) => {
    if (op === 'eq' && value === undefined) {
      issues.push({ path: [...at, 'value'], message: 'op eq needs a value' })
    }
    if (op === 'in' && !Array.isArray(value)) {
      issues.push({ path: [...at, 'value'], message: 'op in needs an array value' })
    }
  }

  const checkCrm = (
    owner: string,
    predicates: EntityCrmPredicate[] | undefined,
    path: (string | number)[],
  ) => {
    for (const [index, predicate] of (predicates ?? []).entries()) {
      const at = [...path, index]
      if (!entities.has(predicate.entity)) {
        issues.push({
          path: [...at, 'entity'],
          message: `${owner} requires entity "${predicate.entity}", which is not in entityPolicies`,
        })
      }
      checkOp(owner, predicate.op, predicate.value, at)
    }
  }

  const checkEntities = (
    owner: string,
    entitiesMap: EntitiesRequires | undefined,
    path: (string | number)[],
  ) => {
    if (!entitiesMap) return
    for (const [entity] of Object.entries(entitiesMap)) {
      if (!entities.has(entity)) {
        issues.push({
          path: [...path, entity],
          message: `${owner} requires entity "${entity}", which is not in entityPolicies`,
        })
      }
    }
  }

  const checkPath = (
    owner: string,
    predicates: SkillStatePathPredicate[] | undefined,
    path: (string | number)[],
  ) => {
    for (const [index, predicate] of (predicates ?? []).entries()) {
      const at = [...path, index]
      const parsed = parseSkillStatePath(predicate.path)
      if (!parsed) {
        issues.push({
          path: [...at, 'path'],
          message: `${owner} requires path "${predicate.path}" is not a state path`,
        })
        continue
      }
      if (parsed.store === 'crm' && !entities.has(parsed.scope)) {
        issues.push({
          path: [...at, 'path'],
          message: `${owner} requires entity "${parsed.scope}", which is not in entityPolicies`,
        })
      }
      checkOp(owner, predicate.op, predicate.value, at)
    }
  }

  if (isV2SkillTools(skill.tools)) {
    for (const [toolIndex, tool] of skill.tools.entries()) {
      checkCrm(tool.tool, tool.requires?.crm, ['tools', toolIndex, 'requires', 'crm'])
      checkEntities(tool.tool, tool.requires?.entities, ['tools', toolIndex, 'requires', 'entities'])
      checkPath(tool.tool, tool.requires?.path, ['tools', toolIndex, 'requires', 'path'])
    }
  }
  checkCrm('reply', skill.reply?.requires?.crm, ['reply', 'requires', 'crm'])
  checkEntities('reply', skill.reply?.requires?.entities, ['reply', 'requires', 'entities'])
  checkPath('reply', skill.reply?.requires?.path, ['reply', 'requires', 'path'])
  return issues
}

/**
 * Tools the platform owns on every customer-facing turn. A skill that lists
 * one changes nothing at runtime: its description never reaches the model.
 */
export const TURN_TOOL_NAMES: readonly string[] = [
  'system:message:send',
  'system:message:skip',
  'system:scratchpad:set',
  'system:scratchpad:get',
  'system:scratchpad:list',
]

/**
 * Warnings for turn tools a skill declares in `tools`. Reply rules belong in
 * `reply` or `requiredWrites`, and reply wording in `instructions`.
 */
export function skillTurnToolWarnings(
  skill: Pick<SkillYAML, 'tools'>,
): string[] {
  return getSkillToolNames(skill.tools)
    .filter((tool) => TURN_TOOL_NAMES.includes(tool))
    .map(
      (tool) =>
        `${tool} is a turn tool the platform provides; remove it from tools and put reply rules under reply or requiredWrites`,
    )
}

/**
 * Format skill instructions for injection into system prompt
 * @deprecated Use formatSkillDiscovery for AI SDK Agent Skills pattern
 */
export function formatSkillInstructions(skills: ResolvedSkill[]): string {
  if (skills.length === 0) return ''

  const sections = skills.map((skill) => {
    if (!skill.instructions) {
      // No instructions loaded - just show name and description
      return `## ${skill.name}\n\n${skill.description || 'No description available.'}`
    }
    
    let section = `## ${skill.name}\n\n${skill.instructions}`

    if (skill.examples && skill.examples.length > 0) {
      section += '\n\n### Examples\n'
      for (const example of skill.examples) {
        section += `\n**Input:** ${example.input}\n`
        if (example.reasoning) {
          section += `**Reasoning:** ${example.reasoning}\n`
        }
        section += `**Output:** ${example.output}\n`
      }
    }

    return section
  })

  return `# Skills\n\n${sections.join('\n\n---\n\n')}`
}

/**
 * Format skill discovery list for system prompt.
 * Following AI SDK Agent Skills pattern: only name + description at startup.
 * Full instructions are loaded on-demand via the loadSkill tool.
 *
 * @param skills - Array of skill discovery info objects
 * @param workflowInstructions - Optional custom workflow instructions for the agent
 */
export function formatSkillDiscovery(
  skills: SkillDiscoveryInfo[],
  workflowInstructions?: string,
): string {
  if (skills.length === 0) return ''

  const skillsList = skills
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join('\n')

  const defaultWorkflow = `WORKFLOW FOR EVERY RESPONSE:
1. Check the Current Context data to understand the current state
2. Read the skill descriptions below - each tells you WHEN to use it
3. Load the matching skill using \`system:skill:load\`
4. Follow the skill's instructions exactly`

  const workflow = workflowInstructions ?? defaultWorkflow

  return `## Skills

${workflow}

Available skills:
${skillsList}

IMPORTANT: Always use the proper tool calls. Do NOT output XML-like tags in your response.`
}
