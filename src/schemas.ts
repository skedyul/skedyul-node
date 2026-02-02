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

/** Standard capability types for communication channels */
export const ChannelCapabilityTypeSchema = z.enum([
  'messaging', // Text-based: SMS, WhatsApp, Messenger, DMs
  'voice', // Audio calls: Phone, WhatsApp Voice, etc.
  'video', // Video calls (future)
])

/** Capability definition with display info and handler references */
export const ChannelCapabilitySchema = z.object({
  name: z.string(), // Display name: "SMS", "WhatsApp Messages"
  icon: z.string().optional(), // Lucide icon name
  receive: z.string().optional(), // Inbound webhook handler
  send: z.string().optional(), // Outbound tool handle
})

/**
 * Field definition for channel field mappings.
 * Defines fields that can be mapped when linking a channel to a model.
 * One field should have identifier: true to mark it as the channel identifier.
 */
export const ChannelFieldDefinitionSchema = z.object({
  handle: z.string(),
  label: z.string(),
  definition: z.object({
    handle: z.string(),
  }).passthrough(),
  /** Marks this field as the identifier field for the channel */
  identifier: z.boolean().optional(),
  /** Whether this field is required */
  required: z.boolean().optional(),
  /** Default value when creating a new field */
  defaultValue: z.object({ value: z.unknown() }).passthrough().optional(),
  /** Visibility settings for the field */
  visibility: z.object({
    data: z.boolean().optional(),
    list: z.boolean().optional(),
    filters: z.boolean().optional(),
  }).passthrough().optional(),
  /** Permission settings for the field */
  permissions: z.object({
    read: z.boolean().optional(),
    write: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough()

export const ChannelDefinitionSchema = z.object({
  handle: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  /** Array of field definitions for this channel. One field must have identifier: true. */
  fields: z.array(ChannelFieldDefinitionSchema),
  // Capabilities keyed by standard type (messaging, voice, video)
  capabilities: z.record(ChannelCapabilityTypeSchema, ChannelCapabilitySchema),
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
export const PageBlockTypeSchema = z.enum(['form', 'spreadsheet', 'kanban', 'calendar', 'link', 'list', 'card'])
export const PageFieldTypeSchema = z.enum(['STRING', 'FILE', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'FORM', 'RELATIONSHIP'])

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
  isDisabled: z.union([z.boolean(), z.string()]).optional(),
  isHidden: z.union([z.boolean(), z.string()]).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// FormV2 Component Schemas (mirrors skedyul-ui FormComponentV2)
// ─────────────────────────────────────────────────────────────────────────────

/** Base style props for FormV2 components */
export const FormV2StylePropsSchema = z.object({
  id: z.string(),
  row: z.number(),
  col: z.number(),
  className: z.string().optional(),
  hidden: z.boolean().optional(),
})

/** Button props for FieldSetting component */
export const FieldSettingButtonPropsSchema = z.object({
  label: z.string(),
  variant: z.enum(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link']).optional(),
  size: z.enum(['default', 'sm', 'lg', 'icon']).optional(),
  isLoading: z.boolean().optional(),
  /** Can be boolean or Liquid template string that resolves to boolean */
  isDisabled: z.union([z.boolean(), z.string()]).optional(),
  leftIcon: z.string().optional(),
})

/** Relationship extension for dynamic data loading */
export const RelationshipExtensionSchema = z.object({
  model: z.string(),
})

/** Layout column definition */
export const FormLayoutColumnDefinitionSchema = z.object({
  field: z.string(),
  colSpan: z.number(),
  dataType: z.string().optional(),
  subQuery: z.unknown().optional(),
})

/** Layout row definition */
export const FormLayoutRowDefinitionSchema = z.object({
  columns: z.array(FormLayoutColumnDefinitionSchema),
})

/** FormLayoutConfig definition */
export const FormLayoutConfigDefinitionSchema = z.object({
  type: z.literal('form'),
  rows: z.array(FormLayoutRowDefinitionSchema),
})

/** Input component definition */
export const InputComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('Input'),
  props: z.object({
    label: z.string().optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    type: z.enum(['text', 'number', 'email', 'password', 'tel', 'url', 'hidden']).optional(),
    required: z.boolean().optional(),
    disabled: z.boolean().optional(),
    value: z.union([z.string(), z.number()]).optional(),
  }),
})

/** Textarea component definition */
export const TextareaComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('Textarea'),
  props: z.object({
    label: z.string().optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    required: z.boolean().optional(),
    disabled: z.boolean().optional(),
    value: z.string().optional(),
  }),
})

/** Select component definition */
export const SelectComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('Select'),
  props: z.object({
    label: z.string().optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    /** Static items array (will be populated by iterable if using dynamic items) */
    items: z.union([z.array(z.object({ value: z.string(), label: z.string() })), z.string()]).optional(),
    value: z.string().optional(),
    isDisabled: z.boolean().optional(),
    required: z.boolean().optional(),
  }),
  relationship: RelationshipExtensionSchema.optional(),
  /** For dynamic items using iterable pattern (e.g., 'system.models') */
  iterable: z.string().optional(),
  /** Template for each item in the iterable */
  itemTemplate: z.object({
    value: z.string(),
    label: z.string(),
  }).optional(),
})

/** Combobox component definition */
export const ComboboxComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('Combobox'),
  props: z.object({
    label: z.string().optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    items: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    value: z.string().optional(),
  }),
  relationship: RelationshipExtensionSchema.optional(),
})

/** Checkbox component definition */
export const CheckboxComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('Checkbox'),
  props: z.object({
    label: z.string().optional(),
    helpText: z.string().optional(),
    checked: z.boolean().optional(),
    disabled: z.boolean().optional(),
  }),
})

/** DatePicker component definition */
export const DatePickerComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('DatePicker'),
  props: z.object({
    label: z.string().optional(),
    helpText: z.string().optional(),
    value: z.union([z.string(), z.date()]).optional(),
    disabled: z.boolean().optional(),
  }),
})

/** TimePicker component definition */
export const TimePickerComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('TimePicker'),
  props: z.object({
    label: z.string().optional(),
    helpText: z.string().optional(),
    value: z.string().optional(),
    disabled: z.boolean().optional(),
  }),
})

/** ImageSetting component definition */
export const ImageSettingComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('ImageSetting'),
  props: z.object({
    label: z.string().optional(),
    description: z.string().optional(),
    helpText: z.string().optional(),
    accept: z.string().optional(),
  }),
})

/** FileSetting component definition for file uploads */
export const FileSettingComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('FileSetting'),
  props: z.object({
    label: z.string().optional(),
    description: z.string().optional(),
    helpText: z.string().optional(),
    accept: z.string().optional(),
    required: z.boolean().optional(),
    button: z.object({
      label: z.string().optional(),
      variant: z.enum(['default', 'outline', 'ghost', 'link']).optional(),
      size: z.enum(['sm', 'md', 'lg']).optional(),
    }).optional(),
  }),
})

/** Item template schema for server-side iterable rendering */
export const ListItemTemplateSchema = z.object({
  component: z.string(),
  span: z.number().optional(),
  mdSpan: z.number().optional(),
  lgSpan: z.number().optional(),
  props: z.record(z.string(), z.unknown()),
})

/** List component definition */
export const ListComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('List'),
  props: z.object({
    title: z.string().optional(),
    items: z.array(z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().optional(),
    })).optional(),
    emptyMessage: z.string().optional(),
  }),
  model: z.string().optional(),
  labelField: z.string().optional(),
  descriptionField: z.string().optional(),
  icon: z.string().optional(),
  /** Context variable name to iterate over (e.g., 'phone_numbers') */
  iterable: z.string().optional(),
  /** Template for each item - use {{ item.xyz }} for field values */
  itemTemplate: ListItemTemplateSchema.optional(),
})

/** EmptyForm component definition */
export const EmptyFormComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('EmptyForm'),
  props: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
  }),
})

/** Alert component definition for display-only informational content */
export const AlertComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('Alert'),
  props: z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
    variant: z.enum(['default', 'destructive']).optional(),
  }),
})

/** Forward declaration for FieldSetting with modalForm */
export type FormV2ComponentDefinition = z.infer<typeof FormV2ComponentDefinitionSchema>

/** Modal form definition for nested forms */
export const ModalFormDefinitionSchema: z.ZodType<{
  header: z.infer<typeof PageFormHeaderSchema>
  handler: string
  template?: string
  templateParams?: Record<string, unknown>
  fields?: FormV2ComponentDefinition[]
  layout?: z.infer<typeof FormLayoutConfigDefinitionSchema>
  actions?: z.infer<typeof PageActionDefinitionSchema>[]
}> = z.object({
  header: PageFormHeaderSchema,
  handler: z.string(),
  /** Named dialog template to use instead of inline fields */
  template: z.string().optional(),
  /** Template-specific params to pass to the dialog */
  templateParams: z.record(z.string(), z.unknown()).optional(),
  /** Inline field definitions (used when template is not specified) */
  fields: z.lazy(() => z.array(FormV2ComponentDefinitionSchema)).optional(),
  layout: FormLayoutConfigDefinitionSchema.optional(),
  actions: z.array(PageActionDefinitionSchema).optional(),
})

/** FieldSetting component definition */
export const FieldSettingComponentDefinitionSchema = FormV2StylePropsSchema.extend({
  component: z.literal('FieldSetting'),
  props: z.object({
    label: z.string(),
    description: z.string().optional(),
    helpText: z.string().optional(),
    mode: z.enum(['field', 'setting']).optional(),
    /** Status indicator - can be literal or Liquid template */
    status: z.string().optional(),
    /** Text to display alongside status badge - can be Liquid template */
    statusText: z.string().optional(),
    button: FieldSettingButtonPropsSchema,
  }),
  modalForm: ModalFormDefinitionSchema.optional(),
})

/** Union of all FormV2 component definitions */
export const FormV2ComponentDefinitionSchema = z.discriminatedUnion('component', [
  InputComponentDefinitionSchema,
  TextareaComponentDefinitionSchema,
  SelectComponentDefinitionSchema,
  ComboboxComponentDefinitionSchema,
  CheckboxComponentDefinitionSchema,
  DatePickerComponentDefinitionSchema,
  TimePickerComponentDefinitionSchema,
  FieldSettingComponentDefinitionSchema,
  ImageSettingComponentDefinitionSchema,
  FileSettingComponentDefinitionSchema,
  ListComponentDefinitionSchema,
  EmptyFormComponentDefinitionSchema,
  AlertComponentDefinitionSchema,
])

/** FormV2 props definition */
export const FormV2PropsDefinitionSchema = z.object({
  formVersion: z.literal('v2'),
  id: z.string().optional(),
  fields: z.array(FormV2ComponentDefinitionSchema),
  layout: FormLayoutConfigDefinitionSchema,
  /** Optional actions that trigger MCP tool calls */
  actions: z.array(PageActionDefinitionSchema).optional(),
})

/** Card block header definition */
export const CardBlockHeaderSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  descriptionHref: z.string().optional(),
})

/** Card block definition (CardV2-aligned) */
export const CardBlockDefinitionSchema = z.object({
  type: z.literal('card'),
  restructurable: z.boolean().optional(),
  header: CardBlockHeaderSchema.optional(),
  form: FormV2PropsDefinitionSchema,
  actions: z.array(PageActionDefinitionSchema).optional(),
  secondaryActions: z.array(PageActionDefinitionSchema).optional(),
  primaryActions: z.array(PageActionDefinitionSchema).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Page Field Definition (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

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
  model: z.string().optional(),
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

/** Legacy form block definition */
export const LegacyFormBlockDefinitionSchema = z.object({
  type: z.enum(['form', 'spreadsheet', 'kanban', 'calendar', 'link']),
  title: z.string().optional(),
  fields: z.array(PageFieldDefinitionSchema).optional(),
  readonly: z.boolean().optional(),
})

/** List block definition */
export const ListBlockDefinitionSchema = z.object({
  type: z.literal('list'),
  title: z.string().optional(),
  model: z.string(),
  labelField: z.string().optional(),
  descriptionField: z.string().optional(),
  icon: z.string().optional(),
  emptyMessage: z.string().optional(),
})

/** Model mapper block definition - for mapping SHARED models to workspace models */
export const ModelMapperBlockDefinitionSchema = z.object({
  type: z.literal('model-mapper'),
  /** The SHARED model handle from provision config */
  modelHandle: z.string(),
  /** Display title */
  title: z.string(),
  /** Description - can use Liquid templates */
  description: z.string().optional(),
  /** Status indicator - Liquid template resolving to 'success' | 'pending' | 'warning' | 'error' */
  status: z.string().optional(),
  /** Status badge text - Liquid template */
  statusText: z.string().optional(),
  /** Button label - Liquid template */
  buttonLabel: z.string().optional(),
  /** Button disabled state - Liquid template resolving to 'true' | 'false' */
  buttonDisabled: z.string().optional(),
})

/** Union of all block types */
export const PageBlockDefinitionSchema = z.union([
  CardBlockDefinitionSchema,
  LegacyFormBlockDefinitionSchema,
  ListBlockDefinitionSchema,
  ModelMapperBlockDefinitionSchema,
])

/** Mode for context data fetching */
export const PageContextModeSchema = z.enum(['first', 'many', 'count'])

/**
 * Page context filters schema.
 * Uses structured filter format: { fieldHandle: { operator: value } }
 * Values can be Liquid template strings, e.g., { id: { eq: '{{ path_params.id }}' } }
 */
export const PageContextFiltersSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.union([PrimitiveSchema, z.array(PrimitiveSchema), z.string()]),
  ),
)

/** Single context item definition */
export const PageContextItemDefinitionSchema = z.object({
  /** Model handle to fetch data from */
  model: z.string(),
  /** Fetch mode: 'first' returns single object, 'many' returns array, 'count' returns number */
  mode: PageContextModeSchema,
  /**
   * Optional filters. Supports:
   * - Simple key-value with Liquid templates: { id: '{{ path_params.id }}' }
   * - StructuredFilter format: { status: { eq: 'APPROVED' } }
   */
  filters: PageContextFiltersSchema.optional(),
  /** Optional limit for 'many' mode */
  limit: z.number().optional(),
})

/** Context definition: variable name -> context item */
export const PageContextDefinitionSchema = z.record(z.string(), PageContextItemDefinitionSchema)

/** @deprecated Use PageContextDefinitionSchema instead */
export const PageInstanceFilterSchema = z.object({
  model: z.string(),
  where: z.record(z.string(), z.unknown()).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Navigation item for sidebar */
export const NavigationItemSchema = z.object({
  /** Display label (supports Liquid templates) */
  label: z.string(),
  /** URL href (supports Liquid templates with path_params and context) */
  href: z.string(),
  /** Optional icon name */
  icon: z.string().optional(),
})

/** Navigation section with title and items */
export const NavigationSectionSchema = z.object({
  /** Section title (supports Liquid templates) */
  title: z.string().optional(),
  /** Navigation items in this section */
  items: z.array(NavigationItemSchema),
})

/** Sidebar navigation configuration */
export const NavigationSidebarSchema = z.object({
  /** Sections to display in the sidebar */
  sections: z.array(NavigationSectionSchema),
})

/** Breadcrumb item */
export const BreadcrumbItemSchema = z.object({
  /** Display label (supports Liquid templates) */
  label: z.string(),
  /** Optional href - if not provided, item is not clickable */
  href: z.string().optional(),
})

/** Breadcrumb navigation configuration */
export const NavigationBreadcrumbSchema = z.object({
  /** Breadcrumb items from left to right */
  items: z.array(BreadcrumbItemSchema),
})

/** Full navigation configuration */
export const NavigationConfigSchema = z.object({
  /** Sidebar navigation */
  sidebar: NavigationSidebarSchema.optional(),
  /** Breadcrumb navigation */
  breadcrumb: NavigationBreadcrumbSchema.optional(),
})

export const PageDefinitionSchema = z.object({
  type: PageTypeSchema,
  title: z.string(),
  /** URL path for this page (e.g., '/phone-numbers' or '/phone-numbers/[id]' for dynamic segments) */
  path: z.string(),
  /** When true, this page is the default landing page for the app installation */
  default: z.boolean().optional(),
  /**
   * Navigation configuration:
   * - true/false: show/hide in auto-generated navigation
   * - string: Liquid template that evaluates to true/false
   * - NavigationConfigSchema: full navigation override for this page (replaces base navigation)
   */
  navigation: z.union([z.boolean(), z.string(), NavigationConfigSchema]).optional().default(true),
  blocks: z.array(PageBlockDefinitionSchema),
  actions: z.array(PageActionDefinitionSchema).optional(),
  /** Context data to load for Liquid templates. appInstallationId filtering is automatic. */
  context: PageContextDefinitionSchema.optional(),
  /** @deprecated Use context instead */
  filter: PageInstanceFilterSchema.optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const WebhookHttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])

export const WebhookTypeSchema = z.enum(['WEBHOOK', 'CALLBACK'])

export const WebhookHandlerDefinitionSchema = z.object({
  description: z.string().optional(),
  methods: z.array(WebhookHttpMethodSchema).optional(),
  /** Invocation type: WEBHOOK (fire-and-forget) or CALLBACK (waits for response). Defaults to WEBHOOK. */
  type: WebhookTypeSchema.optional(),
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
  /** Base navigation configuration for all pages (can be overridden per page) */
  navigation: NavigationConfigSchema.optional(),
  pages: z.array(PageDefinitionSchema).optional(),
  /** Tool name to invoke after executable is healthy during provisioning */
  onProvision: z.string().optional(),
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
export type PageContextMode = z.infer<typeof PageContextModeSchema>
export type PageContextFilters = z.infer<typeof PageContextFiltersSchema>
export type PageContextItemDefinition = z.infer<typeof PageContextItemDefinitionSchema>
export type PageContextDefinition = z.infer<typeof PageContextDefinitionSchema>
/** @deprecated Use PageContextDefinition instead */
export type PageInstanceFilter = z.infer<typeof PageInstanceFilterSchema>
export type NavigationItem = z.infer<typeof NavigationItemSchema>
export type NavigationSection = z.infer<typeof NavigationSectionSchema>
export type NavigationSidebar = z.infer<typeof NavigationSidebarSchema>
export type BreadcrumbItem = z.infer<typeof BreadcrumbItemSchema>
export type NavigationBreadcrumb = z.infer<typeof NavigationBreadcrumbSchema>
export type NavigationConfig = z.infer<typeof NavigationConfigSchema>
export type PageDefinition = z.infer<typeof PageDefinitionSchema>
export type ModelDependency = z.infer<typeof ModelDependencySchema>
export type ChannelDependency = z.infer<typeof ChannelDependencySchema>
export type WorkflowDependency = z.infer<typeof WorkflowDependencySchema>
export type ResourceDependency = z.infer<typeof ResourceDependencySchema>
export type ModelFieldDefinition = z.infer<typeof ModelFieldDefinitionSchema>
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>
export type ChannelCapabilityType = z.infer<typeof ChannelCapabilityTypeSchema>
export type ChannelCapability = z.infer<typeof ChannelCapabilitySchema>
export type ChannelFieldDefinition = z.infer<typeof ChannelFieldDefinitionSchema>
export type ChannelDefinition = z.infer<typeof ChannelDefinitionSchema>
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>
export type WebhookHttpMethod = z.infer<typeof WebhookHttpMethodSchema>
export type WebhookHandlerDefinition = z.infer<typeof WebhookHandlerDefinitionSchema>
export type Webhooks = z.infer<typeof WebhooksSchema>
export type ProvisionConfig = z.infer<typeof ProvisionConfigSchema>

// FormV2 types
export type FormV2StyleProps = z.infer<typeof FormV2StylePropsSchema>
export type FieldSettingButtonProps = z.infer<typeof FieldSettingButtonPropsSchema>
export type RelationshipExtension = z.infer<typeof RelationshipExtensionSchema>
export type FormLayoutColumnDefinition = z.infer<typeof FormLayoutColumnDefinitionSchema>
export type FormLayoutRowDefinition = z.infer<typeof FormLayoutRowDefinitionSchema>
export type FormLayoutConfigDefinition = z.infer<typeof FormLayoutConfigDefinitionSchema>
export type ModalFormDefinition = z.infer<typeof ModalFormDefinitionSchema>
export type FormV2PropsDefinition = z.infer<typeof FormV2PropsDefinitionSchema>
export type CardBlockHeader = z.infer<typeof CardBlockHeaderSchema>
export type CardBlockDefinition = z.infer<typeof CardBlockDefinitionSchema>
export type LegacyFormBlockDefinition = z.infer<typeof LegacyFormBlockDefinitionSchema>
export type ListBlockDefinition = z.infer<typeof ListBlockDefinitionSchema>
export type ModelMapperBlockDefinition = z.infer<typeof ModelMapperBlockDefinitionSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Messaging Tool Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const MessageSendChannelSchema = z.object({
  id: z.string(),
  handle: z.string(),
  identifierValue: z.string(),
})

export const MessageSendSubscriptionSchema = z.object({
  id: z.string(),
  identifierValue: z.string(),
})

export const MessageSendContactSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
})

export const MessageSendMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  contentRaw: z.string().optional(),
  title: z.string().optional(),
})

export const MessageSendInputSchema = z.object({
  channel: MessageSendChannelSchema,
  subscription: MessageSendSubscriptionSchema,
  contact: MessageSendContactSchema,
  message: MessageSendMessageSchema,
})

export const MessageSendOutputSchema = z.object({
  status: z.enum(['sent', 'queued', 'failed']),
  remoteId: z.string().optional(),
})

export type MessageSendChannel = z.infer<typeof MessageSendChannelSchema>
export type MessageSendSubscription = z.infer<typeof MessageSendSubscriptionSchema>
export type MessageSendContact = z.infer<typeof MessageSendContactSchema>
export type MessageSendMessage = z.infer<typeof MessageSendMessageSchema>
export type MessageSendInput = z.infer<typeof MessageSendInputSchema>
export type MessageSendOutput = z.infer<typeof MessageSendOutputSchema>

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
