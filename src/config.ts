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

export interface ChannelToolBindings {
  send_message: string
}

export interface ChannelDefinition {
  handle: string
  name: string
  icon?: string
  tools: ChannelToolBindings
  requires?: ResourceDependency[]
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
export type PageBlockType = 'form' | 'spreadsheet' | 'kanban' | 'calendar' | 'link'
export type PageFieldType = 'STRING' | 'FILE' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT' | 'FORM'

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
  label: string
  handler: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'destructive'
}

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
}

export interface PageBlockDefinition {
  type: PageBlockType
  title?: string
  fields?: PageFieldDefinition[]
  readonly?: boolean
}

export interface PageInstanceFilter {
  model: string
  where?: Record<string, unknown>
}

export interface PageDefinition {
  handle: string
  type: PageType
  title: string
  path?: string
  navigation?: boolean
  blocks: PageBlockDefinition[]
  actions?: PageActionDefinition[]
  filter?: PageInstanceFilter
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handler Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type WebhookHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface WebhookRequest {
  method: string
  headers: Record<string, string>
  body: unknown
  query: Record<string, string>
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
