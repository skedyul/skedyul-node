/**
 * App configuration types.
 *
 * This module defines the main configuration interfaces for Skedyul apps.
 */

import type { ToolRegistry, WebhookRegistry, ToolMetadata, WebhookMetadata } from '../types'
import type { ServerHooks } from '../types/handlers'
import type { CoreApiConfig } from '../core/types'
import type {
  EnvSchema,
  ComputeLayer,
  ModelDefinition,
  RelationshipDefinition,
  ChannelDefinition,
  WorkflowDefinition,
  PageDefinition,
  NavigationConfig,
  AgentDefinition,
} from './types'

/**
 * Install configuration - defines per-install env vars and SHARED models.
 * This is configured by users during app installation.
 */
export interface InstallConfig {
  /** Per-install environment variables (collected from user during install) */
  env?: EnvSchema
  /** SHARED model definitions (mapped to user's existing data during installation) */
  models?: ModelDefinition[]
  /** Relationship definitions between SHARED models */
  relationships?: RelationshipDefinition[]
}

/**
 * Provision configuration - auto-synced when app version is deployed.
 * This is configured by developers and shared across all installations.
 */
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

/**
 * Build configuration - controls how the integration is bundled.
 */
export interface BuildConfig {
  /** External dependencies to exclude from bundling (e.g., ['twilio', 'stripe']) */
  external?: string[]
}

/**
 * CORS configuration options.
 */
export interface CorsOptions {
  allowOrigin?: string
  allowMethods?: string
  allowHeaders?: string
}

/**
 * Main Skedyul app configuration.
 * This is the unified config type used for both declarative config (skedyul.config.ts)
 * and runtime server creation (server.create()).
 */
export interface SkedyulConfig {
  // ─────────────────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────────────────
  /** App name */
  name: string
  /** App version (semver) */
  version?: string
  /** App description */
  description?: string

  // ─────────────────────────────────────────────────────────────────────────────
  // Runtime Configuration
  // ─────────────────────────────────────────────────────────────────────────────
  /** Compute layer: 'serverless' (Lambda) or 'dedicated' (ECS/Docker) */
  computeLayer?: ComputeLayer
  /** Default port for dedicated mode HTTP server */
  defaultPort?: number
  /** Maximum requests before shutdown (serverless mode) */
  maxRequests?: number | null
  /** TTL extension in seconds */
  ttlExtendSeconds?: number
  /** CORS configuration */
  cors?: CorsOptions
  /** Core API configuration */
  coreApi?: CoreApiConfig

  // ─────────────────────────────────────────────────────────────────────────────
  // Registries
  // ─────────────────────────────────────────────────────────────────────────────
  /** Tool registry - direct object or dynamic import */
  tools?: ToolRegistry | Promise<{ toolRegistry: ToolRegistry }>
  /** Webhook registry - direct object or dynamic import */
  webhooks?: WebhookRegistry | Promise<{ webhookRegistry: WebhookRegistry }>

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle Hooks
  // ─────────────────────────────────────────────────────────────────────────────
  /** Lifecycle hooks for install, provision, uninstall, and oauth_callback */
  hooks?: ServerHooks

  // ─────────────────────────────────────────────────────────────────────────────
  // Declarative Configuration (for platform provisioning)
  // ─────────────────────────────────────────────────────────────────────────────
  /** Provision configuration - direct object or dynamic import */
  provision?: ProvisionConfig | Promise<{ default: ProvisionConfig }>
  /** Install configuration - direct object or dynamic import */
  install?: InstallConfig | Promise<{ default: InstallConfig }>
  /** Agent definitions - multi-tenant agents with tool bindings */
  agents?: AgentDefinition[]

  // ─────────────────────────────────────────────────────────────────────────────
  // Build Configuration
  // ─────────────────────────────────────────────────────────────────────────────
  /** Build configuration for the integration */
  build?: BuildConfig
}

/**
 * Serializable config (for database storage).
 * This is the resolved form of SkedyulConfig without functions or promises.
 */
export interface SerializableSkedyulConfig {
  name: string
  version?: string
  description?: string
  computeLayer?: ComputeLayer
  /** Tool metadata (serialized from ToolRegistry) */
  tools?: ToolMetadata[]
  /** Webhook metadata (serialized from WebhookRegistry) */
  webhooks?: WebhookMetadata[]
  /** Provision config (fully resolved) */
  provision?: ProvisionConfig
  /** Agent definitions (stored as-is) */
  agents?: AgentDefinition[]
}

/**
 * Define a Skedyul app configuration with full type safety.
 */
export function defineConfig(config: SkedyulConfig): SkedyulConfig {
  return config
}
