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

// ─────────────────────────────────────────────────────────────────────────────
// Resource Scope and Dependency Schemas
// Unified system for tracking app resources and their dependencies.
// Must be defined before channel/workflow schemas that use them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for resource scope.
 * INTERNAL: App owns this resource, auto-created when feature is provisioned
 * SHARED: Maps to user's existing resource, requires user selection
 */
export const ResourceScopeSchema = z.enum(['INTERNAL', 'SHARED'])

/**
 * Schema for a model dependency reference.
 * Used in `requires` arrays to specify model dependencies.
 */
export const ModelDependencySchema = z.object({
  /** Handle of the model being depended upon */
  model: z.string(),
  /** Specific fields required (undefined = all fields) */
  fields: z.array(z.string()).optional(),
})

/**
 * Schema for a channel dependency reference.
 * Used in `requires` arrays to specify channel dependencies.
 */
export const ChannelDependencySchema = z.object({
  /** Handle of the channel being depended upon */
  channel: z.string(),
})

/**
 * Schema for a workflow dependency reference.
 * Used in `requires` arrays to specify workflow dependencies.
 */
export const WorkflowDependencySchema = z.object({
  /** Handle of the workflow being depended upon */
  workflow: z.string(),
})

/**
 * Union schema for all resource dependency types.
 * Used in `requires` arrays on channels, workflows, etc.
 */
export const ResourceDependencySchema = z.union([
  ModelDependencySchema,
  ChannelDependencySchema,
  WorkflowDependencySchema,
])

/**
 * Schema for communication channel definition.
 */
export const CommunicationChannelDefinitionSchema = z.object({
  handle: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  tools: ChannelToolBindingsSchema,
  identifierValue: ChannelIdentifierValueSchema.optional(),
  appFields: z.array(AppFieldDefinitionSchema).optional(),
  settings: z.array(z.unknown()).optional(),
  /** Typed dependencies - models, fields, etc. this channel requires */
  requires: z.array(ResourceDependencySchema).optional(),
})

/**
 * Shorter alias for channel definition (used in new config syntax).
 */
export const ChannelDefinitionSchema = CommunicationChannelDefinitionSchema

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
  /** Channel handle (optional, deprecated - use requires instead) */
  channelHandle: z.string().optional(),
  /** Typed dependencies - channels, models, etc. this workflow requires */
  requires: z.array(ResourceDependencySchema).optional(),
  /** Actions in this workflow */
  actions: z.array(WorkflowActionSchema),
})

/**
 * Schema for compute layer type.
 */
export const ComputeLayerTypeSchema = z.enum(['serverless', 'dedicated'])

// ─────────────────────────────────────────────────────────────────────────────
// Model Schemas (Unified INTERNAL + SHARED)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for field data types.
 * Matches the DataType enum in the database.
 */
export const FieldDataTypeSchema = z.enum([
  'LONG_STRING',
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATE_TIME',
  'TIME',
  'FILE',
  'IMAGE',
  'RELATION',
  'OBJECT',
])

/**
 * Schema for a field within a model.
 * Works for both INTERNAL and SHARED models.
 */
export const ModelFieldDefinitionSchema = z.object({
  /** Field handle (unique within model) */
  handle: z.string(),
  /** Display label */
  label: z.string(),
  /** Data type (required for INTERNAL, optional for SHARED) */
  type: FieldDataTypeSchema.optional(),
  /** Field definition handle for SHARED fields */
  definitionHandle: z.string().optional(),
  /** Whether field is required */
  required: z.boolean().optional(),
  /** Whether field must be unique */
  unique: z.boolean().optional(),
  /** Whether this is a system field */
  system: z.boolean().optional(),
  /** Whether field holds a list of values */
  isList: z.boolean().optional(),
  /** Default value */
  defaultValue: z.object({ value: z.unknown() }).optional(),
  /** Field description */
  description: z.string().optional(),
  /** Visibility settings for SHARED fields */
  visibility: AppFieldVisibilitySchema.optional(),
})

/**
 * Schema for a unified model definition.
 * Supports both INTERNAL (app-owned) and SHARED (user-mapped) models.
 */
export const ModelDefinitionSchema = z.object({
  /** Model handle (unique within app) */
  handle: z.string(),
  /** Display name */
  name: z.string(),
  /** Plural display name */
  namePlural: z.string().optional(),
  /** Resource scope: INTERNAL (app creates) or SHARED (user maps) */
  scope: ResourceScopeSchema,
  /** Label template for display (required for INTERNAL) */
  labelTemplate: z.string().optional(),
  /** Model description */
  description: z.string().optional(),
  /** Field definitions */
  fields: z.array(ModelFieldDefinitionSchema),
})

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Internal Model Schemas (deprecated - use ModelDefinitionSchema)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use FieldDataTypeSchema instead
 */
export const InternalFieldDataTypeSchema = FieldDataTypeSchema

/**
 * @deprecated Use ModelFieldDefinitionSchema instead
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
 * @deprecated Use ModelDefinitionSchema instead
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
  preInstall: z
    .object({
      env: EnvSchemaSchema.optional(),
    })
    .optional(),
  install: InstallConfigSchema.optional(),
  postInstall: z
    .object({
      env: EnvSchemaSchema.optional(),
    })
    .optional(),

  // New unified model definitions (INTERNAL + SHARED)
  models: z.array(ModelDefinitionSchema).optional(),

  // New channel syntax (alias for communicationChannels)
  channels: z.array(ChannelDefinitionSchema).optional(),

  // Legacy: communication channels (deprecated - use channels)
  communicationChannels: z.array(CommunicationChannelDefinitionSchema).optional(),

  workflows: z.array(WorkflowDefinitionSchema).optional(),

  // Legacy: internal models only (deprecated - use models with scope: INTERNAL)
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

// ─────────────────────────────────────────────────────────────────────────────
// Exported Types
// ─────────────────────────────────────────────────────────────────────────────

/** Resource scope type */
export type ResourceScope = z.infer<typeof ResourceScopeSchema>

/** Model dependency reference */
export type ModelDependency = z.infer<typeof ModelDependencySchema>

/** Channel dependency reference */
export type ChannelDependency = z.infer<typeof ChannelDependencySchema>

/** Workflow dependency reference */
export type WorkflowDependency = z.infer<typeof WorkflowDependencySchema>

/** Union of all resource dependencies */
export type ResourceDependency = z.infer<typeof ResourceDependencySchema>

/** Model field definition */
export type ModelFieldDefinition = z.infer<typeof ModelFieldDefinitionSchema>

/** Unified model definition (INTERNAL or SHARED) */
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>

/** Channel definition */
export type ChannelDefinition = z.infer<typeof ChannelDefinitionSchema>

/** Workflow definition */
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/** Check if a dependency is a model dependency */
export function isModelDependency(dep: ResourceDependency): dep is ModelDependency {
  return 'model' in dep
}

/** Check if a dependency is a channel dependency */
export function isChannelDependency(dep: ResourceDependency): dep is ChannelDependency {
  return 'channel' in dep
}

/** Check if a dependency is a workflow dependency */
export function isWorkflowDependency(dep: ResourceDependency): dep is WorkflowDependency {
  return 'workflow' in dep
}
