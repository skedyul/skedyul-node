import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas for SkedyulConfig
// These schemas are used for runtime validation of config files.
// TypeScript types in config.ts should match these schemas.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for environment variable visibility
 */
export const EnvVisibilitySchema = z.enum(['visible', 'encrypted'])

/**
 * Schema for a single environment variable definition.
 */
export const EnvVariableDefinitionSchema = z.object({
  label: z.string(),
  required: z.boolean().optional(),
  visibility: EnvVisibilitySchema.optional(),
  default: z.string().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
})

/**
 * Schema for a collection of environment variable definitions.
 */
export const EnvSchemaSchema = z.record(z.string(), EnvVariableDefinitionSchema)

/**
 * Schema for app model definition.
 */
export const AppModelDefinitionSchema = z.object({
  entityHandle: z.string(),
  label: z.string(),
  description: z.string().optional(),
})

/**
 * Schema for install configuration.
 */
export const InstallConfigSchema = z.object({
  env: EnvSchemaSchema.optional(),
  appModels: z.array(AppModelDefinitionSchema).optional(),
})

/**
 * Schema for app field visibility.
 */
export const AppFieldVisibilitySchema = z.object({
  data: z.boolean().optional(),
  list: z.boolean().optional(),
  filters: z.boolean().optional(),
})

/**
 * Schema for app field definition (communication channels).
 */
export const AppFieldDefinitionSchema = z.object({
  label: z.string(),
  fieldHandle: z.string(),
  entityHandle: z.string(),
  definitionHandle: z.string(),
  required: z.boolean().optional(),
  system: z.boolean().optional(),
  unique: z.boolean().optional(),
  defaultValue: z.object({ value: z.unknown() }).optional(),
  visibility: AppFieldVisibilitySchema.optional(),
})

/**
 * Schema for channel tool bindings.
 */
export const ChannelToolBindingsSchema = z.object({
  send_message: z.string(),
})

/**
 * Schema for channel identifier type.
 */
export const ChannelIdentifierTypeSchema = z.enum([
  'DEDICATED_PHONE',
  'TEXT',
  'EMAIL',
])

/**
 * Schema for channel identifier value.
 */
export const ChannelIdentifierValueSchema = z.object({
  type: ChannelIdentifierTypeSchema,
  definitionHandle: z.string(),
})

/**
 * Schema for communication channel definition.
 */
export const CommunicationChannelDefinitionSchema = z.object({
  handle: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  tools: ChannelToolBindingsSchema,
  identifierValue: ChannelIdentifierValueSchema,
  appFields: z.array(AppFieldDefinitionSchema).optional(),
  settings: z.array(z.unknown()).optional(),
})

/**
 * Schema for workflow action input.
 */
export const WorkflowActionInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  fieldRef: z
    .object({
      fieldHandle: z.string(),
      entityHandle: z.string(),
    })
    .optional(),
  template: z.string().optional(),
})

/**
 * Schema for workflow action.
 */
export const WorkflowActionSchema = z.object({
  label: z.string(),
  handle: z.string(),
  batch: z.boolean().optional(),
  entityHandle: z.string().optional(),
  inputs: z.array(WorkflowActionInputSchema).optional(),
})

/**
 * Schema for workflow definition.
 */
export const WorkflowDefinitionSchema = z.object({
  /** Path to external YAML workflow file (relative to config) */
  path: z.string(),
  /** Human-readable label (optional when path is provided, inferred from YAML) */
  label: z.string().optional(),
  /** Workflow handle/key (optional when path is provided, inferred from YAML) */
  handle: z.string().optional(),
  /** Channel handle (optional) */
  channelHandle: z.string().optional(),
  /** Actions in this workflow */
  actions: z.array(WorkflowActionSchema),
})

/**
 * Schema for compute layer type.
 */
export const ComputeLayerTypeSchema = z.enum(['serverless', 'dedicated'])

// ─────────────────────────────────────────────────────────────────────────────
// Internal Model Schemas (App-owned models)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for internal field data types.
 */
export const InternalFieldDataTypeSchema = z.enum([
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'URL',
  'PHONE',
  'SELECT',
  'MULTI_SELECT',
  'JSON',
])

/**
 * Schema for a field within an internal model.
 */
export const InternalFieldDefinitionSchema = z.object({
  handle: z.string(),
  label: z.string(),
  type: InternalFieldDataTypeSchema,
  definitionHandle: z.string().optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  system: z.boolean().optional(),
  isList: z.boolean().optional(),
  defaultValue: z.object({ value: z.unknown() }).optional(),
  description: z.string().optional(),
})

/**
 * Schema for an internal model definition.
 */
export const InternalModelDefinitionSchema = z.object({
  handle: z.string(),
  name: z.string(),
  namePlural: z.string(),
  labelTemplate: z.string(),
  description: z.string().optional(),
  fields: z.array(InternalFieldDefinitionSchema),
})

/**
 * Schema for the full skedyul.config.ts stored on an Executable.
 * This is the single source of truth for all app configuration.
 *
 * Note: tools and webhooks are stored as null/unknown since they are
 * dynamic imports that cannot be serialized. Use SerializableSkedyulConfigSchema
 * for database storage which uses ToolMetadata[] and WebhookMetadata[] instead.
 */
export const SkedyulConfigSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  computeLayer: ComputeLayerTypeSchema.optional(),
  // Dynamic imports become null after transpilation
  tools: z.unknown().optional(),
  webhooks: z.unknown().optional(),
  workflowsPath: z.string().optional(),
  env: EnvSchemaSchema.optional(),
  install: InstallConfigSchema.optional(),
  communicationChannels: z.array(CommunicationChannelDefinitionSchema).optional(),
  workflows: z.array(WorkflowDefinitionSchema).optional(),
  internalModels: z.array(InternalModelDefinitionSchema).optional(),
})

/**
 * Inferred type from SkedyulConfigSchema for runtime-validated configs.
 */
export type ParsedSkedyulConfig = z.infer<typeof SkedyulConfigSchema>

/**
 * Safely parse a skedyul config, returning null if invalid.
 */
export function safeParseConfig(data: unknown): ParsedSkedyulConfig | null {
  const result = SkedyulConfigSchema.safeParse(data)
  return result.success ? result.data : null
}
