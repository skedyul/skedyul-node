import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Env Variable Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const EnvVisibilitySchema = z.enum(['visible', 'encrypted'])

export const EnvVariableDefinitionSchema = z.object({
  label: z.string(),
  required: z.boolean().optional(),
  visibility: EnvVisibilitySchema.optional(),
  default: z.string().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
})

export const EnvSchemaSchema = z.record(z.string(), EnvVariableDefinitionSchema)

// ─────────────────────────────────────────────────────────────────────────────
// Compute Layer
// ─────────────────────────────────────────────────────────────────────────────

export const ComputeLayerTypeSchema = z.enum(['serverless', 'dedicated'])

// ─────────────────────────────────────────────────────────────────────────────
// Resource Scope and Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export const ResourceScopeSchema = z.enum(['INTERNAL', 'SHARED'])
export const FieldOwnerSchema = z.enum(['APP', 'WORKPLACE', 'BOTH'])

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean()])
export const StructuredFilterSchema = z.record(
  z.string(),
  z.record(z.string(), z.union([PrimitiveSchema, z.array(PrimitiveSchema)])),
)

export const ModelDependencySchema = z.object({
  model: z.string(),
  fields: z.array(z.string()).optional(),
  where: StructuredFilterSchema.optional(),
})

export const ChannelDependencySchema = z.object({
  channel: z.string(),
})

export const WorkflowDependencySchema = z.object({
  workflow: z.string(),
})

export const ResourceDependencySchema = z.union([
  ModelDependencySchema,
  ChannelDependencySchema,
  WorkflowDependencySchema,
])

// ─────────────────────────────────────────────────────────────────────────────
// Model Schemas
// ─────────────────────────────────────────────────────────────────────────────

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

export const FieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  color: z.string().optional(),
})

export const InlineFieldDefinitionSchema = z.object({
  limitChoices: z.number().optional(),
  options: z.array(FieldOptionSchema).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  relatedModel: z.string().optional(),
  pattern: z.string().optional(),
})

export const AppFieldVisibilitySchema = z.object({
  data: z.boolean().optional(),
  list: z.boolean().optional(),
  filters: z.boolean().optional(),
})

export const ModelFieldDefinitionSchema = z.object({
  handle: z.string(),
  label: z.string(),
  type: FieldDataTypeSchema.optional(),
  definitionHandle: z.string().optional(),
  definition: InlineFieldDefinitionSchema.optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  system: z.boolean().optional(),
  isList: z.boolean().optional(),
  defaultValue: z.object({ value: z.unknown() }).optional(),
  description: z.string().optional(),
  visibility: AppFieldVisibilitySchema.optional(),
  owner: FieldOwnerSchema.optional(),
})

export const ModelDefinitionSchema = z.object({
  handle: z.string(),
  name: z.string(),
  namePlural: z.string().optional(),
  scope: ResourceScopeSchema,
  labelTemplate: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(ModelFieldDefinitionSchema),
  requires: z.array(ResourceDependencySchema).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const RelationshipCardinalitySchema = z.enum([
  'ONE_TO_ONE',
  'ONE_TO_MANY',
  'MANY_TO_ONE',
  'MANY_TO_MANY',
])

export const OnDeleteBehaviorSchema = z.enum(['NONE', 'CASCADE', 'RESTRICT'])

export const RelationshipLinkSchema = z.object({
  model: z.string(),
  field: z.string(),
  label: z.string(),
  cardinality: RelationshipCardinalitySchema,
  onDelete: OnDeleteBehaviorSchema.default('NONE'),
})

export const RelationshipDefinitionSchema = z.object({
  source: RelationshipLinkSchema,
  target: RelationshipLinkSchema,
})

// ─────────────────────────────────────────────────────────────────────────────
// Channel Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ChannelToolBindingsSchema = z.object({
  send_message: z.string(),
})

export const ChannelDefinitionSchema = z.object({
  handle: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  tools: ChannelToolBindingsSchema,
  requires: z.array(ResourceDependencySchema).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const WorkflowActionInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  fieldRef: z.object({
    fieldHandle: z.string(),
    entityHandle: z.string(),
  }).optional(),
  template: z.string().optional(),
})

export const WorkflowActionSchema = z.object({
  label: z.string(),
  handle: z.string(),
  batch: z.boolean().optional(),
  entityHandle: z.string().optional(),
  inputs: z.array(WorkflowActionInputSchema).optional(),
})

export const WorkflowDefinitionSchema = z.object({
  path: z.string(),
  label: z.string().optional(),
  handle: z.string().optional(),
  requires: z.array(ResourceDependencySchema).optional(),
  actions: z.array(WorkflowActionSchema),
})

// ─────────────────────────────────────────────────────────────────────────────
// Page Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const PageTypeSchema = z.enum(['INSTANCE', 'LIST'])
export const PageBlockTypeSchema = z.enum(['form', 'spreadsheet', 'kanban', 'calendar', 'link'])
export const PageFieldTypeSchema = z.enum(['STRING', 'FILE', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'FORM'])

export const PageFieldSourceSchema = z.object({
  model: z.string(),
  field: z.string(),
})

export const PageFormHeaderSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
})

export const PageActionDefinitionSchema = z.object({
  handle: z.string(),
  label: z.string(),
  handler: z.string(),
  icon: z.string().optional(),
  variant: z.enum(['primary', 'secondary', 'destructive']).optional(),
})

/** Base field definition */
const PageFieldDefinitionBaseSchema = z.object({
  handle: z.string(),
  type: PageFieldTypeSchema,
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  handler: z.string().optional(),
  source: PageFieldSourceSchema.optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  accept: z.string().optional(),
})

/** Page field definition type */
export type PageFieldDefinition = z.infer<typeof PageFieldDefinitionBaseSchema> & {
  header?: z.infer<typeof PageFormHeaderSchema>
  fields?: PageFieldDefinition[]
  actions?: PageActionDefinition[]
}

/** Self-contained field definition for page blocks */
export const PageFieldDefinitionSchema: z.ZodType<PageFieldDefinition> = PageFieldDefinitionBaseSchema.extend({
  header: PageFormHeaderSchema.optional(),
  fields: z.lazy(() => z.array(PageFieldDefinitionSchema)).optional(),
  actions: z.lazy(() => z.array(PageActionDefinitionSchema)).optional(),
})

export const PageBlockDefinitionSchema = z.object({
  type: PageBlockTypeSchema,
  title: z.string().optional(),
  fields: z.array(PageFieldDefinitionSchema).optional(),
  readonly: z.boolean().optional(),
})

export const PageInstanceFilterSchema = z.object({
  model: z.string(),
  where: z.record(z.string(), z.unknown()).optional(),
})

export const PageDefinitionSchema = z.object({
  handle: z.string(),
  type: PageTypeSchema,
  title: z.string(),
  path: z.string().optional(),
  navigation: z.boolean().optional().default(true),
  blocks: z.array(PageBlockDefinitionSchema),
  actions: z.array(PageActionDefinitionSchema).optional(),
  filter: PageInstanceFilterSchema.optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const WebhookHttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])

export const WebhookHandlerDefinitionSchema = z.object({
  description: z.string().optional(),
  methods: z.array(WebhookHttpMethodSchema).optional(),
  handler: z.unknown(),
})

export const WebhooksSchema = z.record(z.string(), WebhookHandlerDefinitionSchema)

// ─────────────────────────────────────────────────────────────────────────────
// Provision Config Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ProvisionConfigSchema = z.object({
  env: EnvSchemaSchema.optional(),
  models: z.array(ModelDefinitionSchema).optional(),
  relationships: z.array(RelationshipDefinitionSchema).optional(),
  channels: z.array(ChannelDefinitionSchema).optional(),
  workflows: z.array(WorkflowDefinitionSchema).optional(),
  pages: z.array(PageDefinitionSchema).optional(),
  webhooks: z.array(z.string()).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Main Config Schema
// ─────────────────────────────────────────────────────────────────────────────

export const SkedyulConfigSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  computeLayer: ComputeLayerTypeSchema.optional(),
  tools: z.unknown().optional(),
  webhooks: z.unknown().optional(),
  provision: z.union([ProvisionConfigSchema, z.unknown()]).optional(),
})

export type ParsedSkedyulConfig = z.infer<typeof SkedyulConfigSchema>

export function safeParseConfig(data: unknown): ParsedSkedyulConfig | null {
  const result = SkedyulConfigSchema.safeParse(data)
  return result.success ? result.data : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported Types
// ─────────────────────────────────────────────────────────────────────────────

export type ResourceScope = z.infer<typeof ResourceScopeSchema>
export type FieldOwner = z.infer<typeof FieldOwnerSchema>
export type StructuredFilter = z.infer<typeof StructuredFilterSchema>
export type FieldOption = z.infer<typeof FieldOptionSchema>
export type InlineFieldDefinition = z.infer<typeof InlineFieldDefinitionSchema>
export type RelationshipCardinality = z.infer<typeof RelationshipCardinalitySchema>
export type OnDeleteBehavior = z.infer<typeof OnDeleteBehaviorSchema>
export type RelationshipLink = z.infer<typeof RelationshipLinkSchema>
export type RelationshipDefinition = z.infer<typeof RelationshipDefinitionSchema>
export type PageType = z.infer<typeof PageTypeSchema>
export type PageBlockType = z.infer<typeof PageBlockTypeSchema>
export type PageFieldType = z.infer<typeof PageFieldTypeSchema>
export type PageFieldSource = z.infer<typeof PageFieldSourceSchema>
export type PageActionDefinition = z.infer<typeof PageActionDefinitionSchema>
export type PageBlockDefinition = z.infer<typeof PageBlockDefinitionSchema>
export type PageInstanceFilter = z.infer<typeof PageInstanceFilterSchema>
export type PageDefinition = z.infer<typeof PageDefinitionSchema>
export type ModelDependency = z.infer<typeof ModelDependencySchema>
export type ChannelDependency = z.infer<typeof ChannelDependencySchema>
export type WorkflowDependency = z.infer<typeof WorkflowDependencySchema>
export type ResourceDependency = z.infer<typeof ResourceDependencySchema>
export type ModelFieldDefinition = z.infer<typeof ModelFieldDefinitionSchema>
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>
export type ChannelDefinition = z.infer<typeof ChannelDefinitionSchema>
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>
export type WebhookHttpMethod = z.infer<typeof WebhookHttpMethodSchema>
export type WebhookHandlerDefinition = z.infer<typeof WebhookHandlerDefinitionSchema>
export type Webhooks = z.infer<typeof WebhooksSchema>
export type ProvisionConfig = z.infer<typeof ProvisionConfigSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

export function isModelDependency(dep: ResourceDependency): dep is ModelDependency {
  return 'model' in dep
}

export function isChannelDependency(dep: ResourceDependency): dep is ChannelDependency {
  return 'channel' in dep
}

export function isWorkflowDependency(dep: ResourceDependency): dep is WorkflowDependency {
  return 'workflow' in dep
}
