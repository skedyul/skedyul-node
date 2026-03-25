/**
 * Config resolution utilities.
 *
 * This module provides functions to resolve dynamic imports in SkedyulConfig
 * and convert it to a serializable format for the /config endpoint.
 */

import type {
  SkedyulConfig,
  SerializableSkedyulConfig,
  ProvisionConfig,
  InstallConfig,
} from './app-config'
import type {
  ToolRegistry,
  ToolMetadata,
  WebhookRegistry,
  WebhookMetadata,
} from '../types'

/**
 * Resolves a potentially dynamic import to its actual value.
 * Handles both direct values and Promise<{ default: T }> from dynamic imports.
 */
async function resolveDynamicImport<T>(
  value: T | Promise<{ default: T }> | undefined,
): Promise<T | undefined> {
  if (value === undefined || value === null) {
    return undefined
  }

  // If it's a promise (from dynamic import), await it
  if (value instanceof Promise) {
    const resolved = await value
    // Dynamic imports return { default: ... } for default exports
    if (resolved && typeof resolved === 'object' && 'default' in resolved) {
      return resolved.default
    }
    return resolved as T
  }

  return value
}

/**
 * Serializes a ToolRegistry to an array of ToolMetadata.
 */
function serializeTools(registry: ToolRegistry): ToolMetadata[] {
  return Object.entries(registry).map(([key, tool]) => ({
    name: tool.name || key,
    displayName: tool.label,
    description: tool.description,
    timeout: tool.timeout as number | undefined,
    retries: tool.retries as number | undefined,
  }))
}

/**
 * Serializes a WebhookRegistry to an array of WebhookMetadata.
 */
function serializeWebhooks(registry: WebhookRegistry): WebhookMetadata[] {
  return Object.values(registry).map((webhook) => ({
    name: webhook.name,
    description: webhook.description,
    methods: webhook.methods ?? ['POST'],
    type: webhook.type ?? 'WEBHOOK',
  }))
}

/**
 * Resolves all dynamic imports in a SkedyulConfig and returns a serializable version.
 *
 * This function:
 * 1. Resolves dynamic imports for tools, webhooks, provision, and install
 * 2. Serializes tool and webhook registries to metadata arrays
 * 3. Returns a plain object suitable for JSON serialization
 *
 * @param config - The original SkedyulConfig (may contain dynamic imports)
 * @param registry - The resolved tool registry (already loaded by mcp_server.ts)
 * @param webhookRegistry - The resolved webhook registry (if any)
 * @returns A fully resolved and serializable config
 */
export async function resolveConfig(
  config: SkedyulConfig,
  registry: ToolRegistry,
  webhookRegistry?: WebhookRegistry,
): Promise<SerializableSkedyulConfig> {
  // Resolve provision config (handles dynamic import)
  const provision = await resolveDynamicImport<ProvisionConfig>(
    config.provision as ProvisionConfig | Promise<{ default: ProvisionConfig }> | undefined,
  )

  // Resolve install config (handles dynamic import)
  const install = await resolveDynamicImport<InstallConfig>(
    config.install as InstallConfig | Promise<{ default: InstallConfig }> | undefined,
  )

  // Serialize tools from the registry
  const tools = serializeTools(registry)

  // Serialize webhooks from the registry
  const webhooks = webhookRegistry ? serializeWebhooks(webhookRegistry) : []

  return {
    name: config.name,
    version: config.version,
    description: config.description,
    computeLayer: config.computeLayer,
    tools,
    webhooks,
    provision,
    agents: config.agents,
  }
}

/**
 * Creates a minimal SkedyulConfig from server metadata.
 * Used as a fallback when appConfig is not provided.
 */
export function createMinimalConfig(
  name: string,
  version?: string,
): SkedyulConfig {
  return {
    name,
    version,
  }
}
