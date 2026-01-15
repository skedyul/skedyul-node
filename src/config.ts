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
// App Model Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface AppModelDefinition {
  /** Unique handle for the entity (e.g., 'client', 'patient') */
  entityHandle: string
  /** Human-readable label */
  label: string
  /** Description of what this model represents */
  description?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Install Handler Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context passed to the install handler when a user installs the app.
 */
export interface InstallHandlerContext {
  /** Environment variables from preInstall.env filled by the user */
  env: Record<string, string>
  /** Workplace information */
  workplace: {
    id: string
    subdomain: string
  }
}

/**
 * Result returned by the install handler.
 */
export interface InstallHandlerResult {
  /** Additional environment variables to add to the installation */
  env?: Record<string, string>
  /** Optional OAuth redirect URL - if provided, user is redirected before install completes */
  redirect?: string
}

/**
 * Install handler function type.
 */
export type InstallHandler = (ctx: InstallHandlerContext) => Promise<InstallHandlerResult>

// ─────────────────────────────────────────────────────────────────────────────
// Install Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallConfig {
  /**
   * Per-install environment variables.
   * These are configured by the user when installing the app.
   * Values are stored per-installation and can differ between installs.
   * @deprecated Use preInstall.env and postInstall.env instead
   */
  env?: EnvSchema
  /**
   * Model mappings required for this app.
   * Users will map these to their CRM models during installation.
   */
  appModels?: AppModelDefinition[]
  /**
   * Install handler - called when user clicks install.
   * Use dynamic import: handler: import('./src/install')
   */
  handler?: Promise<{ default: InstallHandler }>
}

/**
 * Pre-install configuration.
 * Variables collected BEFORE the app is installed (e.g., API keys, credentials).
 */
export interface PreInstallConfig {
  /**
   * Environment variables required before installation.
   * User must provide these values during the install flow.
   */
  env?: EnvSchema
}

/**
 * Post-install configuration.
 * Variables that can be configured AFTER the app is installed.
 */
export interface PostInstallConfig {
  /**
   * Environment variables configurable after installation.
   * These appear in the Settings page of the installed app.
   */
  env?: EnvSchema
}

// ─────────────────────────────────────────────────────────────────────────────
// App Field Definition (for communication channels)
// ─────────────────────────────────────────────────────────────────────────────

export interface AppFieldVisibility {
  /** Show in data/detail view */
  data?: boolean
  /** Show in list view */
  list?: boolean
  /** Show in filters */
  filters?: boolean
}

export interface AppFieldDefinition {
  /** Human-readable label */
  label: string
  /** Field handle/key */
  fieldHandle: string
  /** Entity this field belongs to (e.g., 'contact') */
  entityHandle: string
  /** Metafield definition handle */
  definitionHandle: string
  /** Whether this field is required */
  required?: boolean
  /** Whether this is a system field */
  system?: boolean
  /** Whether values must be unique */
  unique?: boolean
  /** Default value */
  defaultValue?: { value: unknown }
  /** Visibility settings */
  visibility?: AppFieldVisibility
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Tool Bindings
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelToolBindings {
  /** Tool name for sending messages on this channel */
  send_message: string
  // Future: additional tool bindings can be added here
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Scope and Dependencies
// ─────────────────────────────────────────────────────────────────────────────

/** Scope of a model: INTERNAL (app-owned) or SHARED (user-mapped) */
export type ResourceScope = 'INTERNAL' | 'SHARED'

/** Model dependency reference */
export interface ModelDependency {
  /** Handle of the model being depended upon */
  model: string
  /** Specific fields required (undefined = all fields) */
  fields?: string[]
}

/** Channel dependency reference */
export interface ChannelDependency {
  /** Handle of the channel being depended upon */
  channel: string
}

/** Workflow dependency reference */
export interface WorkflowDependency {
  /** Handle of the workflow being depended upon */
  workflow: string
}

/** Union of all resource dependency types */
export type ResourceDependency = ModelDependency | ChannelDependency | WorkflowDependency

// ─────────────────────────────────────────────────────────────────────────────
// Unified Model Definition
// ─────────────────────────────────────────────────────────────────────────────

/** Field definition for unified models (works for INTERNAL and SHARED) */
export interface ModelFieldDefinition {
  /** Field handle (unique within model) */
  handle: string
  /** Display label */
  label: string
  /** Data type (required for INTERNAL, optional for SHARED) */
  type?: InternalFieldDataType
  /** Field definition handle for SHARED fields */
  definitionHandle?: string
  /** Whether field is required */
  required?: boolean
  /** Whether field must be unique */
  unique?: boolean
  /** Whether this is a system field */
  system?: boolean
  /** Whether field holds a list of values */
  isList?: boolean
  /** Default value */
  defaultValue?: { value: unknown }
  /** Field description */
  description?: string
  /** Visibility settings (for SHARED fields) */
  visibility?: AppFieldVisibility
}

/** Unified model definition (supports both INTERNAL and SHARED) */
export interface ModelDefinition {
  /** Model handle (unique within app) */
  handle: string
  /** Display name */
  name: string
  /** Plural display name */
  namePlural?: string
  /** Resource scope: INTERNAL (app creates) or SHARED (user maps) */
  scope: ResourceScope
  /** Label template for display (required for INTERNAL) */
  labelTemplate?: string
  /** Model description */
  description?: string
  /** Field definitions */
  fields: ModelFieldDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Communication Channel Definition
// ─────────────────────────────────────────────────────────────────────────────

export type ChannelIdentifierType = 'DEDICATED_PHONE' | 'TEXT' | 'EMAIL'

export interface ChannelIdentifierValue {
  /** Type of identifier */
  type: ChannelIdentifierType
  /** Metafield definition handle for the identifier */
  definitionHandle: string
}

export interface CommunicationChannelDefinition {
  /** Unique handle for this channel type (e.g., 'sms', 'email') */
  handle: string
  /** Human-readable name */
  name: string
  /** Icon for UI (lucide icon name) */
  icon?: string
  /** Tool bindings for this channel */
  tools: ChannelToolBindings
  /** How the channel identifier is configured */
  identifierValue?: ChannelIdentifierValue
  /** Fields to add to contacts when using this channel */
  appFields?: AppFieldDefinition[]
  /** Additional settings UI */
  settings?: unknown[]
  /** Typed dependencies - models, fields this channel requires */
  requires?: ResourceDependency[]
}

/** Alias for channel definition (new naming) */
export type ChannelDefinition = CommunicationChannelDefinition

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowActionInput {
  /** Input key */
  key: string
  /** Human-readable label */
  label: string
  /** Reference to a field */
  fieldRef?: {
    fieldHandle: string
    entityHandle: string
  }
  /** Template string for the input */
  template?: string
}

export interface WorkflowAction {
  /** Human-readable label */
  label: string
  /** Action handle/key */
  handle: string
  /** Whether this action supports batch execution */
  batch?: boolean
  /** Entity this action operates on */
  entityHandle?: string
  /** Input definitions for this action */
  inputs?: WorkflowActionInput[]
}

export interface WorkflowDefinition {
  /** Path to external YAML workflow file (relative to config) */
  path: string
  /** Human-readable label (optional when path is provided, inferred from YAML) */
  label?: string
  /** Workflow handle/key (optional when path is provided, inferred from YAML) */
  handle?: string
  /** Typed dependencies - channels, models this workflow requires */
  requires?: ResourceDependency[]
  /** Actions in this workflow */
  actions: WorkflowAction[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Model Definition (App-owned models)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported data types for internal model fields.
 * Matches the DataType enum in the database.
 */
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

/**
 * Definition of a field within an internal model.
 * This is a normalized format that can be reused for standard models.
 */
export interface InternalFieldDefinition {
  /** Unique handle for the field (e.g., 'phone', 'forwarding_phone_number') */
  handle: string
  /** Human-readable label */
  label: string
  /** Data type of the field */
  type: InternalFieldDataType
  /** Optional metafield definition handle for validation/normalization */
  definitionHandle?: string
  /** Whether this field is required */
  required?: boolean
  /** Whether values must be unique across instances */
  unique?: boolean
  /** Whether this is a system field (managed by app logic) */
  system?: boolean
  /** Whether this field is a list (array of values) */
  isList?: boolean
  /** Default value for the field */
  defaultValue?: { value: unknown }
  /** Description/help text */
  description?: string
}

/**
 * Definition of an internal model owned by an app.
 * Internal models are created and managed by the app, not by users.
 * Data is stored in the standard Model/Field/Instance tables.
 */
export interface InternalModelDefinition {
  /** Unique handle for the model (e.g., 'dedicated_phone_number') */
  handle: string
  /** Human-readable singular name */
  name: string
  /** Human-readable plural name */
  namePlural: string
  /** Template for generating instance labels (e.g., '{{phone}}') */
  labelTemplate: string
  /** Description of the model */
  description?: string
  /** Fields in this model */
  fields: InternalFieldDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute Layer
// ─────────────────────────────────────────────────────────────────────────────

export type ComputeLayerType = 'serverless' | 'dedicated'
// ─────────────────────────────────────────────────────────────────────────────
// Main Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface SkedyulConfig {
  // ─────────────────────────────────────────────────────────────────────────
  // App Metadata
  // ─────────────────────────────────────────────────────────────────────────

  /** App name */
  name: string
  /** App version (semver) */
  version?: string
  /** App description */
  description?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Runtime Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /** Compute layer: 'serverless' (Lambda) or 'dedicated' (ECS/Docker) */
  computeLayer?: ComputeLayerType

  // ─────────────────────────────────────────────────────────────────────────
  // Paths
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Tool registry - can be:
   * - A path string to the registry file (e.g., './src/registry.ts')
   * - A dynamic import promise (e.g., import('./src/registry'))
   *
   * @example
   * // Path string (legacy)
   * tools: './src/registry.ts'
   *
   * // Dynamic import (recommended)
   * tools: import('./src/registry')
   */
  tools?: string | Promise<{ registry: ToolRegistry }>

  /**
   * Webhook registry - can be:
   * - A path string to the webhook registry file
   * - A dynamic import promise (e.g., import('./src/webhooks'))
   *
   * @example
   * // Dynamic import (recommended)
   * webhooks: import('./src/webhooks')
   */
  webhooks?: string | Promise<{ registry: WebhookRegistry }>

  /** Path to the workflows directory (default: './workflows') */
  workflowsPath?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Global Environment Variables
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Global/version-level environment variables.
   * These are baked into the container and are the same for all installations.
   * Use for configuration that doesn't change per-install.
   */
  env?: EnvSchema

  // ─────────────────────────────────────────────────────────────────────────
  // Install Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Install-time configuration.
   * Defines what users need to configure when installing the app.
   * @deprecated Use preInstall and postInstall instead
   */
  install?: InstallConfig

  /**
   * Pre-install configuration.
   * Environment variables collected BEFORE the app is installed.
   * User must provide these values (e.g., API keys) during the install flow.
   */
  preInstall?: PreInstallConfig

  /**
   * Post-install configuration.
   * Environment variables that can be configured AFTER the app is installed.
   * These appear in the Settings page of the installed app.
   */
  postInstall?: PostInstallConfig

  // ─────────────────────────────────────────────────────────────────────────
  // Models (Unified INTERNAL + SHARED)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Unified model definitions (INTERNAL + SHARED).
   * INTERNAL models are created and managed by the app.
   * SHARED models map to user's existing models.
   *
   * @example
   * ```typescript
   * models: [
   *   {
   *     handle: 'phone_number',
   *     name: 'Phone Number',
   *     scope: 'INTERNAL',
   *     labelTemplate: '{{phone}}',
   *     fields: [
   *       { handle: 'phone', label: 'Phone Number', type: 'STRING', required: true },
   *     ],
   *   },
   *   {
   *     handle: 'contact',
   *     name: 'Contact',
   *     scope: 'SHARED',
   *     fields: [
   *       { handle: 'phone', label: 'Phone', definitionHandle: 'phone', required: true },
   *     ],
   *   },
   * ]
   * ```
   */
  models?: ModelDefinition[]

  // ─────────────────────────────────────────────────────────────────────────
  // Communication Channels
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Communication channels this app provides (new syntax).
   * Uses typed `requires` for dependencies.
   */
  channels?: ChannelDefinition[]

  /**
   * Communication channels this app provides (legacy syntax).
   * @deprecated Use `channels` instead
   */
  communicationChannels?: CommunicationChannelDefinition[]

  // ─────────────────────────────────────────────────────────────────────────
  // Workflows
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Workflows this app provides.
   * Can reference channels via `requires: [{ channel: 'sms' }]`.
   */
  workflows?: WorkflowDefinition[]

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Models (Legacy)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Internal models owned by this app.
   * @deprecated Use `models` with `scope: 'INTERNAL'` instead
   */
  internalModels?: InternalModelDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializable Config (for database storage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serializable snapshot of SkedyulConfig for database storage.
 * 
 * This type mirrors SkedyulConfig but replaces non-serializable fields
 * (dynamic imports, handlers) with their serializable metadata equivalents.
 * 
 * Use this type when storing executable configuration in the database.
 */
export interface SerializableSkedyulConfig {
  // ─────────────────────────────────────────────────────────────────────────
  // App Metadata
  // ─────────────────────────────────────────────────────────────────────────

  /** App name */
  name: string
  /** App version (semver) */
  version?: string
  /** App description */
  description?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Runtime Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /** Compute layer: 'serverless' (Lambda) or 'dedicated' (ECS/Docker) */
  computeLayer?: ComputeLayerType

  // ─────────────────────────────────────────────────────────────────────────
  // Serialized Registries (metadata only, no handlers)
  // ─────────────────────────────────────────────────────────────────────────

  /** Tool metadata array (serialized from ToolRegistry) */
  tools?: ToolMetadata[]
  /** Webhook metadata array (serialized from WebhookRegistry) */
  webhooks?: WebhookMetadata[]

  // ─────────────────────────────────────────────────────────────────────────
  // Paths (for reference)
  // ─────────────────────────────────────────────────────────────────────────

  /** Path to the workflows directory */
  workflowsPath?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Environment Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /** Global/version-level environment variable schema */
  env?: EnvSchema

  // ─────────────────────────────────────────────────────────────────────────
  // Install Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /** Install-time configuration @deprecated Use preInstall and postInstall */
  install?: InstallConfig

  /** Pre-install configuration (env vars required before install) */
  preInstall?: PreInstallConfig

  /** Post-install configuration (env vars configurable after install) */
  postInstall?: PostInstallConfig

  // ─────────────────────────────────────────────────────────────────────────
  // Models
  // ─────────────────────────────────────────────────────────────────────────

  /** Unified model definitions (INTERNAL + SHARED) */
  models?: ModelDefinition[]

  // ─────────────────────────────────────────────────────────────────────────
  // Communication Channels
  // ─────────────────────────────────────────────────────────────────────────

  /** Communication channels (new syntax) */
  channels?: ChannelDefinition[]

  /** Communication channels (legacy) @deprecated */
  communicationChannels?: CommunicationChannelDefinition[]

  // ─────────────────────────────────────────────────────────────────────────
  // Workflows
  // ─────────────────────────────────────────────────────────────────────────

  /** Workflows this app provides */
  workflows?: WorkflowDefinition[]

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Models (Legacy)
  // ─────────────────────────────────────────────────────────────────────────

  /** Internal models @deprecated Use models with scope: INTERNAL */
  internalModels?: InternalModelDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a Skedyul app configuration with full type safety.
 *
 * @example
 * ```typescript
 * // skedyul.config.ts
 * import { defineConfig } from 'skedyul'
 *
 * export default defineConfig({
 *   name: 'My App',
 *   computeLayer: 'dedicated',
 *   // Use dynamic import for the tool registry (recommended)
 *   tools: import('./src/registry'),
 *   env: {
 *     LOG_LEVEL: { label: 'Log Level', default: 'info' },
 *   },
 *   install: {
 *     env: {
 *       API_KEY: { label: 'API Key', required: true, visibility: 'encrypted' },
 *     },
 *   },
 * })
 * ```
 */
export function defineConfig(config: SkedyulConfig): SkedyulConfig {
  return config
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Loading Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default config file names to search for
 */
export const CONFIG_FILE_NAMES = [
  'skedyul.config.ts',
  'skedyul.config.js',
  'skedyul.config.mjs',
  'skedyul.config.cjs',
]

/**
 * Transpile a TypeScript config file to JavaScript
 */
async function transpileTypeScript(filePath: string): Promise<string> {
  const content = fs.readFileSync(filePath, 'utf-8')

  // Simple transpilation: remove type annotations and convert to CommonJS
  // For more complex configs, users should pre-compile or use a JS config
  let transpiled = content
    // Remove import type statements
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?\n?/g, '')
    // Convert import { defineConfig } from 'skedyul' to require
    .replace(
      /import\s+\{\s*defineConfig\s*\}\s+from\s+['"]skedyul['"]\s*;?\n?/g,
      '',
    )
    // Remove type annotations like : SkedyulConfig
    .replace(/:\s*SkedyulConfig/g, '')
    // Convert export default to module.exports
    .replace(/export\s+default\s+/, 'module.exports = ')
    // Replace defineConfig() wrapper with just the object
    .replace(/defineConfig\s*\(\s*\{/, '{')
    // Remove the closing paren from defineConfig
    .replace(/\}\s*\)\s*;?\s*$/, '}')

  return transpiled
}

/**
 * Load a Skedyul config from a file path
 */
export async function loadConfig(configPath: string): Promise<SkedyulConfig> {
  const absolutePath = path.resolve(configPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`)
  }

  const isTypeScript = absolutePath.endsWith('.ts')

  try {
    let moduleToLoad = absolutePath

    if (isTypeScript) {
      // Transpile TypeScript to a temp JS file
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
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // For JS files, use dynamic import
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

/**
 * Validate a config object
 */
export function validateConfig(config: SkedyulConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Required fields
  if (!config.name) {
    errors.push('Missing required field: name')
  }

  // Validate computeLayer
  if (config.computeLayer && !['serverless', 'dedicated'].includes(config.computeLayer)) {
    errors.push(`Invalid computeLayer: ${config.computeLayer}. Must be 'serverless' or 'dedicated'`)
  }

  // Validate env schema
  if (config.env) {
    for (const [key, def] of Object.entries(config.env)) {
      if (!def.label) {
        errors.push(`env.${key}: Missing required field 'label'`)
      }
      if (def.visibility && !['visible', 'encrypted'].includes(def.visibility)) {
        errors.push(`env.${key}: Invalid visibility '${def.visibility}'`)
      }
    }
  }

  // Validate install.env schema (deprecated)
  if (config.install?.env) {
    for (const [key, def] of Object.entries(config.install.env)) {
      if (!def.label) {
        errors.push(`install.env.${key}: Missing required field 'label'`)
      }
      if (def.visibility && !['visible', 'encrypted'].includes(def.visibility)) {
        errors.push(`install.env.${key}: Invalid visibility '${def.visibility}'`)
      }
    }
  }

  // Validate preInstall.env schema
  if (config.preInstall?.env) {
    for (const [key, def] of Object.entries(config.preInstall.env)) {
      if (!def.label) {
        errors.push(`preInstall.env.${key}: Missing required field 'label'`)
      }
      if (def.visibility && !['visible', 'encrypted'].includes(def.visibility)) {
        errors.push(`preInstall.env.${key}: Invalid visibility '${def.visibility}'`)
      }
    }
  }

  // Validate postInstall.env schema
  if (config.postInstall?.env) {
    for (const [key, def] of Object.entries(config.postInstall.env)) {
      if (!def.label) {
        errors.push(`postInstall.env.${key}: Missing required field 'label'`)
      }
      if (def.visibility && !['visible', 'encrypted'].includes(def.visibility)) {
        errors.push(`postInstall.env.${key}: Invalid visibility '${def.visibility}'`)
      }
    }
  }

  // Validate appModels
  if (config.install?.appModels) {
    for (let i = 0; i < config.install.appModels.length; i++) {
      const model = config.install.appModels[i]
      if (!model.entityHandle) {
        errors.push(`install.appModels[${i}]: Missing required field 'entityHandle'`)
      }
      if (!model.label) {
        errors.push(`install.appModels[${i}]: Missing required field 'label'`)
      }
    }
  }

  // Validate communicationChannels
  if (config.communicationChannels) {
    for (let i = 0; i < config.communicationChannels.length; i++) {
      const channel = config.communicationChannels[i]
      if (!channel.handle) {
        errors.push(`communicationChannels[${i}]: Missing required field 'handle'`)
      }
      if (!channel.name) {
        errors.push(`communicationChannels[${i}]: Missing required field 'name'`)
      }
      if (!channel.tools?.send_message) {
        errors.push(`communicationChannels[${i}]: Missing required field 'tools.send_message'`)
      }
      if (!channel.identifierValue?.type) {
        errors.push(`communicationChannels[${i}]: Missing required field 'identifierValue.type'`)
      }
      if (!channel.identifierValue?.definitionHandle) {
        errors.push(`communicationChannels[${i}]: Missing required field 'identifierValue.definitionHandle'`)
      }
    }
  }

  // Validate workflows
  if (config.workflows) {
    for (let i = 0; i < config.workflows.length; i++) {
      const workflow = config.workflows[i]
      // When path is provided, handle and label are optional (inferred from YAML)
      // When path is not provided, handle and label are required
      if (!workflow.path) {
        if (!workflow.handle) {
          errors.push(`workflows[${i}]: Missing required field 'handle' (required when 'path' is not provided)`)
        }
        if (!workflow.label) {
          errors.push(`workflows[${i}]: Missing required field 'label' (required when 'path' is not provided)`)
        }
      }
      if (!workflow.actions || workflow.actions.length === 0) {
        errors.push(`workflows[${i}]: Must have at least one action`)
      }
    }
  }

  // Validate internalModels
  if (config.internalModels) {
    const validDataTypes = [
      'LONG_STRING', 'STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'DATE_TIME',
      'TIME', 'FILE', 'IMAGE', 'RELATION', 'OBJECT',
    ]
    for (let i = 0; i < config.internalModels.length; i++) {
      const model = config.internalModels[i]
      if (!model.handle) {
        errors.push(`internalModels[${i}]: Missing required field 'handle'`)
      }
      if (!model.name) {
        errors.push(`internalModels[${i}]: Missing required field 'name'`)
      }
      if (!model.namePlural) {
        errors.push(`internalModels[${i}]: Missing required field 'namePlural'`)
      }
      if (!model.labelTemplate) {
        errors.push(`internalModels[${i}]: Missing required field 'labelTemplate'`)
      }
      if (!model.fields || model.fields.length === 0) {
        errors.push(`internalModels[${i}]: Must have at least one field`)
      } else {
        for (let j = 0; j < model.fields.length; j++) {
          const field = model.fields[j]
          if (!field.handle) {
            errors.push(`internalModels[${i}].fields[${j}]: Missing required field 'handle'`)
          }
          if (!field.label) {
            errors.push(`internalModels[${i}].fields[${j}]: Missing required field 'label'`)
          }
          if (!field.type) {
            errors.push(`internalModels[${i}].fields[${j}]: Missing required field 'type'`)
          } else if (!validDataTypes.includes(field.type)) {
            errors.push(`internalModels[${i}].fields[${j}]: Invalid type '${field.type}'`)
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Get all required install env keys from a config
 * @deprecated Use getRequiredPreInstallEnvKeys instead
 */
export function getRequiredInstallEnvKeys(config: SkedyulConfig): string[] {
  if (!config.install?.env) return []

  return Object.entries(config.install.env)
    .filter(([, def]) => def.required)
    .map(([key]) => key)
}

/**
 * Get all required pre-install env keys from a config
 */
export function getRequiredPreInstallEnvKeys(config: SkedyulConfig): string[] {
  if (!config.preInstall?.env) return []

  return Object.entries(config.preInstall.env)
    .filter(([, def]) => def.required)
    .map(([key]) => key)
}

/**
 * Get all env keys (both global and install) from a config
 */
export function getAllEnvKeys(config: SkedyulConfig): { 
  global: string[]
  install: string[]
  preInstall: string[]
  postInstall: string[]
} {
  return {
    global: config.env ? Object.keys(config.env) : [],
    install: config.install?.env ? Object.keys(config.install.env) : [],
    preInstall: config.preInstall?.env ? Object.keys(config.preInstall.env) : [],
    postInstall: config.postInstall?.env ? Object.keys(config.postInstall.env) : [],
  }
}

