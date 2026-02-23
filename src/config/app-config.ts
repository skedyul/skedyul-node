import type { ToolRegistry, WebhookRegistry, ToolMetadata, WebhookMetadata } from '../types'
import type {
  EnvSchema,
  ComputeLayerType,
  ModelDefinition,
  RelationshipDefinition,
  ChannelDefinition,
  WorkflowDefinition,
  PageDefinition,
  NavigationConfig,
  AgentDefinition,
} from './types'

// Re-export handler types from main types
export type {
  InstallHandlerContext,
  InstallHandlerResult,
  InstallHandler,
  InstallHandlerResponseOAuth,
  InstallHandlerResponseStandard,
  HasOAuthCallback,
  ServerHooksWithOAuth,
  ServerHooksWithoutOAuth,
  ProvisionHandlerContext,
  ProvisionHandlerResult,
  ProvisionHandler,
  ServerHooks,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Install Configuration (for install.config.ts in apps)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Install configuration - defines per-install env vars and SHARED models.
 */
export interface InstallConfig {
  /** Per-install environment variables (collected from user during install, passed at runtime) */
  env?: EnvSchema
  /** SHARED model definitions (mapped to user's existing data during installation) */
  models?: ModelDefinition[]
  /** Relationship definitions between SHARED models */
  relationships?: RelationshipDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Provision Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Provision-level configuration - auto-synced when app version is deployed */
export interface ProvisionConfig {
  /** Global environment variables (developer-level, shared across all installs) */
  env?: EnvSchema
  /** INTERNAL model definitions (app-owned, not visible to users) */
  models?: ModelDefinition[]
  /** Relationship definitions between INTERNAL models */
  relationships?: RelationshipDefinition[]
  /** Communication channel definitions */
  channels?: ChannelDefinition[]
  /** Workflow definitions */
  workflows?: WorkflowDefinition[]
  /** Base navigation configuration for all pages (can be overridden per page) */
  navigation?: NavigationConfig
  /** Page definitions for app UI */
  pages?: PageDefinition[]
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
  /** Agent definitions - multi-tenant agents with tool bindings */
  agents?: AgentDefinition[]
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
  /** Agent definitions (stored as-is) */
  agents?: AgentDefinition[]
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
