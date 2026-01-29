import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { ToolRegistry, WebhookRegistry, ToolMetadata, WebhookMetadata } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Env Variable Definition
// ─────────────────────────────────────────────────────────────────────────────

export type EnvVisibility = 'visible' | 'encrypted'

export interface EnvVariableDefinition {
  /** Human-readable label for the variable */
  label: string
  /** Whether this variable is required */
  required?: boolean
  /** Visibility setting (encrypted values are hidden in UI) */
  visibility?: EnvVisibility
  /** Default value if not provided */
  default?: string
  /** Description/help text */
  description?: string
  /** Placeholder text for input fields */
  placeholder?: string
}

export type EnvSchema = Record<string, EnvVariableDefinition>

// ─────────────────────────────────────────────────────────────────────────────
// Compute Layer
// ─────────────────────────────────────────────────────────────────────────────

export type ComputeLayerType = 'serverless' | 'dedicated'

// ─────────────────────────────────────────────────────────────────────────────
// Resource Scope and Dependencies
// ─────────────────────────────────────────────────────────────────────────────

/** Scope of a model: INTERNAL (app-owned) or SHARED (user-mapped) */
export type ResourceScope = 'INTERNAL' | 'SHARED'

/**
 * Field-level data ownership.
 * APP: App exclusively controls this data (e.g., status field set by webhook)
 * WORKPLACE: User/organization provides this data (e.g., file upload)
 * BOTH: Collaborative - either can update
 */
export type FieldOwner = 'APP' | 'WORKPLACE' | 'BOTH'

/**
 * StructuredFilter for conditional dependencies.
 * Format: { fieldHandle: { operator: value | value[] } }
 */
export type StructuredFilter = Record<string, Record<string, string | number | boolean | (string | number | boolean)[]>>

/** Model dependency reference */
export interface ModelDependency {
  model: string
  fields?: string[]
  where?: StructuredFilter
}

/** Channel dependency reference */
export interface ChannelDependency {
  channel: string
}

/** Workflow dependency reference */
export interface WorkflowDependency {
  workflow: string
}

/** Union of all resource dependency types */
export type ResourceDependency = ModelDependency | ChannelDependency | WorkflowDependency

// ─────────────────────────────────────────────────────────────────────────────
// Model Definition
// ─────────────────────────────────────────────────────────────────────────────

export type InternalFieldDataType =
  | 'LONG_STRING'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATE_TIME'
  | 'TIME'
  | 'FILE'
  | 'IMAGE'
  | 'RELATION'
  | 'OBJECT'

export interface FieldOption {
  label: string
  value: string
  color?: string
}

export interface InlineFieldDefinition {
  limitChoices?: number
  options?: FieldOption[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  relatedModel?: string
  pattern?: string
}

export interface AppFieldVisibility {
  data?: boolean
  list?: boolean
  filters?: boolean
}

export interface ModelFieldDefinition {
  handle: string
  label: string
  type?: InternalFieldDataType
  definitionHandle?: string
  definition?: InlineFieldDefinition
  required?: boolean
  unique?: boolean
  system?: boolean
  isList?: boolean
  defaultValue?: { value: unknown }
  description?: string
  visibility?: AppFieldVisibility
  owner?: FieldOwner
}

export interface ModelDefinition {
  handle: string
  name: string
  namePlural?: string
  scope: ResourceScope
  labelTemplate?: string
  description?: string
  fields: ModelFieldDefinition[]
  requires?: ResourceDependency[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Definition
// ─────────────────────────────────────────────────────────────────────────────

export type RelationshipCardinality = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY'
export type OnDeleteBehavior = 'NONE' | 'CASCADE' | 'RESTRICT'

export interface RelationshipLink {
  model: string
  field: string
  label: string
  cardinality: RelationshipCardinality
  onDelete?: OnDeleteBehavior
}

export interface RelationshipDefinition {
  source: RelationshipLink
  target: RelationshipLink
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Definition
// ─────────────────────────────────────────────────────────────────────────────

/** Standard capability types for communication channels */
export type ChannelCapabilityType = 'messaging' | 'voice' | 'video'

/** Capability definition with display info and handler references */
export interface ChannelCapability {
  /** Display name: "SMS", "WhatsApp Messages" */
  name: string
  /** Lucide icon name */
  icon?: string
  /** Inbound webhook handler */
  receive?: string
  /** Outbound tool handle */
  send?: string
}

export interface ChannelFieldPermissions {
  read?: boolean
  write?: boolean
}

/**
 * Field definition for channel field mappings.
 * One field should have identifier: true to mark it as the channel identifier.
 */
export interface ChannelFieldDefinition {
  handle: string
  label: string
  definition: { handle: string }
  /** Marks this field as the identifier field for the channel */
  identifier?: boolean
  required?: boolean
  defaultValue?: { value: unknown }
  visibility?: AppFieldVisibility
  permissions?: ChannelFieldPermissions
}

export interface ChannelDefinition {
  handle: string
  name: string
  icon?: string
  /** Field definitions for channel. One field must have identifier: true. */
  fields: ChannelFieldDefinition[]
  /** Capabilities keyed by standard type (messaging, voice, video) */
  capabilities: Partial<Record<ChannelCapabilityType, ChannelCapability>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowActionInput {
  key: string
  label: string
  fieldRef?: { fieldHandle: string; entityHandle: string }
  template?: string
}

export interface WorkflowAction {
  label: string
  handle: string
  batch?: boolean
  entityHandle?: string
  inputs?: WorkflowActionInput[]
}

export interface WorkflowDefinition {
  path: string
  label?: string
  handle?: string
  requires?: ResourceDependency[]
  actions: WorkflowAction[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Definition
// ─────────────────────────────────────────────────────────────────────────────

export type PageType = 'INSTANCE' | 'LIST'
export type PageBlockType = 'form' | 'spreadsheet' | 'kanban' | 'calendar' | 'link' | 'list' | 'card'
export type PageFieldType = 'STRING' | 'FILE' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT' | 'FORM' | 'RELATIONSHIP'

export interface PageFieldSource {
  model: string
  field: string
}

export interface PageFormHeader {
  title: string
  description?: string
}

export interface PageActionDefinition {
  handle: string
  /** Button label - supports Liquid templates e.g. "{{ compliance_records[0].status == 'APPROVED' ? 'Register' : 'Pending' }}" */
  label: string
  handler: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'destructive'
  /** Whether the action is disabled - boolean or Liquid template string e.g. "{{ compliance_records[0].status != 'APPROVED' }}" */
  isDisabled?: boolean | string
  /** Whether the action is hidden - boolean or Liquid template string */
  isHidden?: boolean | string
}

// ─────────────────────────────────────────────────────────────────────────────
// FormV2 Component Definitions (mirrors skedyul-ui FormComponentV2)
// ─────────────────────────────────────────────────────────────────────────────

/** Base style props for FormV2 components */
export interface FormV2StyleProps {
  id: string
  row: number
  col: number
  className?: string
  hidden?: boolean
}

/** Button props for FieldSetting component */
export interface FieldSettingButtonProps {
  label: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  isLoading?: boolean
  /** Can be boolean or Liquid template string that resolves to boolean */
  isDisabled?: boolean | string
  leftIcon?: string
}

/** Relationship extension for dynamic data loading */
export interface RelationshipExtension {
  model: string
}

/** Modal form definition for nested forms (handled by skedyul-web, not skedyul-ui) */
export interface ModalFormDefinition {
  header: PageFormHeader
  handler: string
  fields: FormV2ComponentDefinition[]
  layout: FormLayoutConfigDefinition
  actions: PageActionDefinition[]
}

/** Input component definition */
export interface InputComponentDefinition extends FormV2StyleProps {
  component: 'Input'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url' | 'hidden'
    required?: boolean
    disabled?: boolean
    value?: string | number
  }
}

/** Textarea component definition */
export interface TextareaComponentDefinition extends FormV2StyleProps {
  component: 'Textarea'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    required?: boolean
    disabled?: boolean
    value?: string
  }
}

/** Select component definition */
export interface SelectComponentDefinition extends FormV2StyleProps {
  component: 'Select'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    /** Static items array (will be populated by iterable if using dynamic items) */
    items?: Array<{ value: string; label: string }> | string
    value?: string
    isDisabled?: boolean
    required?: boolean
  }
  /** For relationship-based selects */
  relationship?: RelationshipExtension
  /** For dynamic items using iterable pattern (e.g., 'system.models') */
  iterable?: string
  /** Template for each item in the iterable */
  itemTemplate?: {
    value: string
    label: string
  }
}

/** Combobox component definition */
export interface ComboboxComponentDefinition extends FormV2StyleProps {
  component: 'Combobox'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    items?: Array<{ value: string; label: string }>
    value?: string
  }
  /** For relationship-based comboboxes */
  relationship?: RelationshipExtension
}

/** Checkbox component definition */
export interface CheckboxComponentDefinition extends FormV2StyleProps {
  component: 'Checkbox'
  props: {
    label?: string
    helpText?: string
    checked?: boolean
    disabled?: boolean
  }
}

/** DatePicker component definition */
export interface DatePickerComponentDefinition extends FormV2StyleProps {
  component: 'DatePicker'
  props: {
    label?: string
    helpText?: string
    value?: string | Date
    disabled?: boolean
  }
}

/** TimePicker component definition */
export interface TimePickerComponentDefinition extends FormV2StyleProps {
  component: 'TimePicker'
  props: {
    label?: string
    helpText?: string
    value?: string
    disabled?: boolean
  }
}

/** FieldSetting component definition (button that can open modal) */
export interface FieldSettingComponentDefinition extends FormV2StyleProps {
  component: 'FieldSetting'
  props: {
    label: string
    description?: string
    helpText?: string
    mode?: 'field' | 'setting'
    button: FieldSettingButtonProps
  }
  /** Nested modal form (handled by skedyul-web) */
  modalForm?: ModalFormDefinition
}

/** ImageSetting component definition */
export interface ImageSettingComponentDefinition extends FormV2StyleProps {
  component: 'ImageSetting'
  props: {
    label?: string
    description?: string
    helpText?: string
    accept?: string
  }
}

/** FileSetting component definition for file uploads */
export interface FileSettingComponentDefinition extends FormV2StyleProps {
  component: 'FileSetting'
  props: {
    label?: string
    description?: string
    helpText?: string
    accept?: string
    required?: boolean
    button?: {
      label?: string
      variant?: 'default' | 'outline' | 'ghost' | 'link'
      size?: 'sm' | 'md' | 'lg'
    }
  }
}

/** Item template for server-side iterable rendering */
export interface ListItemTemplate {
  component: string
  span?: number
  mdSpan?: number
  lgSpan?: number
  props: Record<string, unknown>
}

/** List component definition */
export interface ListComponentDefinition extends FormV2StyleProps {
  component: 'List'
  props: {
    title?: string
    items?: Array<{ id: string; label: string; description?: string }>
    emptyMessage?: string
  }
  /** Model to fetch list items from (legacy) */
  model?: string
  labelField?: string
  descriptionField?: string
  icon?: string
  /** Context variable name to iterate over (e.g., 'phone_numbers') */
  iterable?: string
  /** Template for each item - use {{ item.xyz }} for field values */
  itemTemplate?: ListItemTemplate
}

/** EmptyForm component definition */
export interface EmptyFormComponentDefinition extends FormV2StyleProps {
  component: 'EmptyForm'
  props: {
    title?: string
    description?: string
    icon?: string
  }
}

/** Alert component definition for display-only informational content */
export interface AlertComponentDefinition extends FormV2StyleProps {
  component: 'Alert'
  props: {
    title: string
    description: string
    icon?: string
    variant?: 'default' | 'destructive'
  }
}

/** Union of all FormV2 component definitions */
export type FormV2ComponentDefinition =
  | InputComponentDefinition
  | TextareaComponentDefinition
  | SelectComponentDefinition
  | ComboboxComponentDefinition
  | CheckboxComponentDefinition
  | DatePickerComponentDefinition
  | TimePickerComponentDefinition
  | FieldSettingComponentDefinition
  | ImageSettingComponentDefinition
  | FileSettingComponentDefinition
  | ListComponentDefinition
  | EmptyFormComponentDefinition
  | AlertComponentDefinition

/** Layout column definition */
export interface FormLayoutColumnDefinition {
  field: string
  colSpan: number
  dataType?: string
  subQuery?: unknown
}

/** Layout row definition */
export interface FormLayoutRowDefinition {
  columns: FormLayoutColumnDefinition[]
}

/** FormLayoutConfig definition (mirrors skedyul-ui FormLayoutConfig) */
export interface FormLayoutConfigDefinition {
  type: 'form'
  rows: FormLayoutRowDefinition[]
}

/** FormV2 props definition */
export interface FormV2PropsDefinition {
  formVersion: 'v2'
  id?: string
  fields: FormV2ComponentDefinition[]
  layout: FormLayoutConfigDefinition
  /** Optional actions that trigger MCP tool calls */
  actions?: PageActionDefinition[]
}

/** Card block header definition */
export interface CardBlockHeader {
  title: string
  description?: string
  descriptionHref?: string
}

/** Card block definition (CardV2-aligned) */
export interface CardBlockDefinition {
  type: 'card'
  /** Disable drag-and-drop in the form */
  restructurable?: boolean
  header?: CardBlockHeader
  form: FormV2PropsDefinition
  actions?: PageActionDefinition[]
  secondaryActions?: PageActionDefinition[]
  primaryActions?: PageActionDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Page Field Definition (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export interface PageFieldDefinition {
  handle: string
  type: PageFieldType
  label: string
  description?: string
  required?: boolean
  handler?: string
  source?: PageFieldSource
  options?: Array<{ value: string; label: string }>
  accept?: string
  header?: PageFormHeader
  fields?: PageFieldDefinition[]
  actions?: PageActionDefinition[]
  /** Target internal model handle for RELATIONSHIP type fields */
  model?: string
}

/** Legacy form block definition */
export interface LegacyFormBlockDefinition {
  type: 'form' | 'spreadsheet' | 'kanban' | 'calendar' | 'link'
  title?: string
  fields?: PageFieldDefinition[]
  readonly?: boolean
}

/** List block definition */
export interface ListBlockDefinition {
  type: 'list'
  title?: string
  /** Model handle to fetch instances from */
  model: string
  /** Field to use as the tile label */
  labelField?: string
  /** Field to use as the tile description */
  descriptionField?: string
  /** Icon for each tile */
  icon?: string
  /** Message when no items */
  emptyMessage?: string
}

/** Union of all block types */
export type PageBlockDefinition = CardBlockDefinition | LegacyFormBlockDefinition | ListBlockDefinition

/** Mode for context data fetching */
export type PageContextMode = 'first' | 'many' | 'count'

/**
 * Page context filters using structured format.
 * Format: { fieldHandle: { operator: value } }
 * Values can be Liquid template strings, e.g., { id: { eq: '{{ path_params.id }}' } }
 */
export type PageContextFilters = Record<
  string,
  Record<string, string | number | boolean | (string | number | boolean)[]>
>

/** Single context item definition */
export interface PageContextItemDefinition {
  /** Model handle to fetch data from */
  model: string
  /** Fetch mode: 'first' returns single object, 'many' returns array, 'count' returns number */
  mode: PageContextMode
  /**
   * Optional filters. Supports:
   * - Simple key-value with Liquid templates: { id: '{{ path_params.id }}' }
   * - StructuredFilter format: { status: { eq: 'APPROVED' } }
   */
  filters?: PageContextFilters
  /** Optional limit for 'many' mode */
  limit?: number
}

/** Context definition: variable name -> context item */
export type PageContextDefinition = Record<string, PageContextItemDefinition>

/** @deprecated Use PageContextDefinition instead */
export interface PageInstanceFilter {
  model: string
  where?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Navigation item for sidebar */
export interface NavigationItem {
  /** Display label (supports Liquid templates) */
  label: string
  /** URL href (supports Liquid templates with path_params and context) */
  href: string
  /** Optional icon name */
  icon?: string
}

/** Navigation section with title and items */
export interface NavigationSection {
  /** Section title (supports Liquid templates) */
  title?: string
  /** Navigation items in this section */
  items: NavigationItem[]
}

/** Sidebar navigation configuration */
export interface NavigationSidebar {
  /** Sections to display in the sidebar */
  sections: NavigationSection[]
}

/** Breadcrumb item */
export interface BreadcrumbItem {
  /** Display label (supports Liquid templates) */
  label: string
  /** Optional href - if not provided, item is not clickable */
  href?: string
}

/** Breadcrumb navigation configuration */
export interface NavigationBreadcrumb {
  /** Breadcrumb items from left to right */
  items: BreadcrumbItem[]
}

/** Full navigation configuration */
export interface NavigationConfig {
  /** Sidebar navigation */
  sidebar?: NavigationSidebar
  /** Breadcrumb navigation */
  breadcrumb?: NavigationBreadcrumb
}

export interface PageDefinition {
  type: PageType
  title: string
  /** URL path for this page (e.g., '/phone-numbers' or '/phone-numbers/[id]' for dynamic segments) */
  path: string
  /** When true, this page is the default landing page for the app installation */
  default?: boolean
  /**
   * Navigation configuration:
   * - true/false: show/hide in auto-generated navigation
   * - string: Liquid template that evaluates to true/false
   * - NavigationConfig: full navigation override for this page (replaces base navigation)
   */
  navigation?: boolean | string | NavigationConfig
  blocks: PageBlockDefinition[]
  actions?: PageActionDefinition[]
  /** Context data to load for Liquid templates. appInstallationId filtering is automatic. */
  context?: PageContextDefinition
  /** @deprecated Use context instead */
  filter?: PageInstanceFilter
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handler Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type WebhookHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface WebhookRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string>
  body: unknown
  rawBody?: Buffer
}

export interface WebhookHandlerContext {
  appInstallationId: string | null
  workplace: { id: string; subdomain: string | null } | null
  registration: Record<string, unknown>
}

export interface WebhookHandlerResponse {
  status: number
  body?: unknown
  headers?: Record<string, string>
}

export type WebhookHandlerFn = (
  request: WebhookRequest,
  context: WebhookHandlerContext,
) => Promise<WebhookHandlerResponse>

export interface WebhookHandlerDefinition {
  description?: string
  methods?: WebhookHttpMethod[]
  handler: WebhookHandlerFn
}

export type Webhooks = Record<string, WebhookHandlerDefinition>

// ─────────────────────────────────────────────────────────────────────────────
// Install Handler Types (for install.ts in apps)
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallHandlerContext {
  env: Record<string, string>
  workplace: { id: string; subdomain: string }
  appInstallationId: string
  createOAuthCallback: (
    handlerName: string,
    context?: Record<string, unknown>,
  ) => Promise<{ url: string; id: string }>
}

export interface InstallHandlerResult {
  env?: Record<string, string>
  redirect?: string
}

export type InstallHandler = (ctx: InstallHandlerContext) => Promise<InstallHandlerResult>

// ─────────────────────────────────────────────────────────────────────────────
// Install Configuration (for install.config.ts in apps)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Install configuration - defines tool names to invoke for install/uninstall lifecycle.
 * Tool names reference tools in the tool registry, enabling agent-invocation.
 */
export interface InstallConfig {
  /** Tool name to invoke when app is installed */
  onInstall?: string
  /** Tool name to invoke when app is uninstalled */
  onUninstall?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Provision Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Provision-level configuration - auto-synced when app version is deployed */
export interface ProvisionConfig {
  /** Global environment variables (developer-level, shared across all installs) */
  env?: EnvSchema
  /** Model definitions (INTERNAL + SHARED) */
  models?: ModelDefinition[]
  /** Relationship definitions between models */
  relationships?: RelationshipDefinition[]
  /** Communication channel definitions */
  channels?: ChannelDefinition[]
  /** Workflow definitions */
  workflows?: WorkflowDefinition[]
  /** Base navigation configuration for all pages (can be overridden per page) */
  navigation?: NavigationConfig
  /** Page definitions for app UI */
  pages?: PageDefinition[]
  /** Webhook handler names to auto-register at provision level */
  webhooks?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface SkedyulConfig {
  /** App name */
  name: string
  /** App version (semver) */
  version?: string
  /** App description */
  description?: string
  /** Compute layer: 'serverless' (Lambda) or 'dedicated' (ECS/Docker) */
  computeLayer?: ComputeLayerType

  /** Tool registry - direct object or dynamic import */
  tools?: ToolRegistry | Promise<{ toolRegistry: ToolRegistry }>
  /** Webhook registry - direct object or dynamic import */
  webhooks?: WebhookRegistry | Promise<{ webhookRegistry: WebhookRegistry }>
  /** Provision configuration - direct object or dynamic import */
  provision?: ProvisionConfig | Promise<{ default: ProvisionConfig }>
  /** Install configuration - hooks for install/uninstall lifecycle */
  install?: InstallConfig | Promise<{ default: InstallConfig }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializable Config (for database storage)
// ─────────────────────────────────────────────────────────────────────────────

export interface SerializableSkedyulConfig {
  name: string
  version?: string
  description?: string
  computeLayer?: ComputeLayerType
  /** Tool metadata (serialized from ToolRegistry) */
  tools?: ToolMetadata[]
  /** Webhook metadata (serialized from WebhookRegistry) */
  webhooks?: WebhookMetadata[]
  /** Provision config (fully resolved) */
  provision?: ProvisionConfig
}

export interface WebhookHandlerMetadata {
  name: string
  description?: string
  methods?: WebhookHttpMethod[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a Skedyul app configuration with full type safety.
 */
export function defineConfig(config: SkedyulConfig): SkedyulConfig {
  return config
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Loading Utilities
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_FILE_NAMES = [
  'skedyul.config.ts',
  'skedyul.config.js',
  'skedyul.config.mjs',
  'skedyul.config.cjs',
]

async function transpileTypeScript(filePath: string): Promise<string> {
  const content = fs.readFileSync(filePath, 'utf-8')
  let transpiled = content
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?\n?/g, '')
    .replace(/import\s+\{\s*defineConfig\s*\}\s+from\s+['"]skedyul['"]\s*;?\n?/g, '')
    .replace(/:\s*SkedyulConfig/g, '')
    .replace(/export\s+default\s+/, 'module.exports = ')
    .replace(/defineConfig\s*\(\s*\{/, '{')
    .replace(/\}\s*\)\s*;?\s*$/, '}')
  return transpiled
}

export async function loadConfig(configPath: string): Promise<SkedyulConfig> {
  const absolutePath = path.resolve(configPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`)
  }

  const isTypeScript = absolutePath.endsWith('.ts')

  try {
    let moduleToLoad = absolutePath

    if (isTypeScript) {
      const transpiled = await transpileTypeScript(absolutePath)
      const tempDir = os.tmpdir()
      const tempFile = path.join(tempDir, `skedyul-config-${Date.now()}.js`)
      fs.writeFileSync(tempFile, transpiled)
      moduleToLoad = tempFile

      try {
        const module = require(moduleToLoad)
        const config = module.default || module

        if (!config || typeof config !== 'object') {
          throw new Error('Config file must export a configuration object')
        }

        if (!config.name || typeof config.name !== 'string') {
          throw new Error('Config must have a "name" property')
        }

        return config as SkedyulConfig
      } finally {
        try {
          fs.unlinkSync(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    const module = await import(moduleToLoad)
    const config = module.default || module

    if (!config || typeof config !== 'object') {
      throw new Error('Config file must export a configuration object')
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Config must have a "name" property')
    }

    return config as SkedyulConfig
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function validateConfig(config: SkedyulConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.name) {
    errors.push('Missing required field: name')
  }

  if (config.computeLayer && !['serverless', 'dedicated'].includes(config.computeLayer)) {
    errors.push(`Invalid computeLayer: ${config.computeLayer}. Must be 'serverless' or 'dedicated'`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Get all environment variable keys from the config.
 * Returns separate arrays for global and install-level keys.
 * Note: With the new config structure, all env is at provision level (global).
 */
export function getAllEnvKeys(config: SkedyulConfig): { global: string[]; install: string[] } {
  // Resolve provision if it's already resolved (not a Promise)
  const provision = config.provision && 'env' in config.provision 
    ? config.provision as ProvisionConfig 
    : undefined
  
  const globalKeys = provision?.env ? Object.keys(provision.env) : []
  
  // Install-level env is deprecated in the new structure
  return {
    global: globalKeys,
    install: [],
  }
}

/**
 * Get required install-level environment variable keys.
 * Note: With the new config structure, install-level env is deprecated.
 * All required env vars are now at provision level.
 */
export function getRequiredInstallEnvKeys(config: SkedyulConfig): string[] {
  // Resolve provision if it's already resolved (not a Promise)
  const provision = config.provision && 'env' in config.provision 
    ? config.provision as ProvisionConfig 
    : undefined
  
  if (!provision?.env) return []
  
  return Object.entries(provision.env)
    .filter(([, def]) => def.required)
    .map(([key]) => key)
}
