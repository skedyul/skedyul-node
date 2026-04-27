/**
 * Config resolution utilities for build-time config export.
 *
 * This module provides functions to fully resolve a skedyul.config.ts file,
 * including all dynamic imports (tools, webhooks, provision).
 */

import * as path from 'path'
import type { SkedyulConfig, SerializableSkedyulConfig, ProvisionConfig } from './app-config'
import type { ToolRegistry, WebhookRegistry } from '../types'

/**
 * Resolved config with all promises awaited.
 */
export interface ResolvedConfig extends Omit<SkedyulConfig, 'tools' | 'webhooks' | 'provision'> {
  tools?: ToolRegistry
  webhooks?: WebhookRegistry
  provision?: ProvisionConfig
}

/**
 * Load and fully resolve a skedyul.config.ts file.
 *
 * This function:
 * 1. Dynamically imports the config file using tsx/node
 * 2. Awaits all dynamic imports (tools, webhooks, provision)
 * 3. Returns the fully resolved config
 *
 * @param configPath - Path to the skedyul.config.ts file
 * @returns Fully resolved config with all promises awaited
 */
export async function loadAndResolveConfig(configPath: string): Promise<ResolvedConfig> {
  const absolutePath = path.resolve(configPath)

  // Use dynamic import to load the config file
  // tsx/node will handle TypeScript transpilation
  const module = await import(absolutePath)
  const config = module.default as SkedyulConfig

  if (!config || typeof config !== 'object') {
    throw new Error('Config file must export a configuration object')
  }

  if (!config.name || typeof config.name !== 'string') {
    throw new Error('Config must have a "name" property')
  }

  // Resolve tools - can be direct object or Promise<{ toolRegistry: ToolRegistry }>
  let tools: ToolRegistry | undefined
  if (config.tools) {
    if (config.tools instanceof Promise) {
      const resolved = await config.tools
      tools = (resolved as { toolRegistry?: ToolRegistry; default?: ToolRegistry }).toolRegistry ||
              (resolved as { toolRegistry?: ToolRegistry; default?: ToolRegistry }).default
    } else {
      tools = config.tools as ToolRegistry
    }
  }

  // Resolve webhooks - can be direct object or Promise<{ webhookRegistry: WebhookRegistry }>
  let webhooks: WebhookRegistry | undefined
  if (config.webhooks) {
    if (config.webhooks instanceof Promise) {
      const resolved = await config.webhooks
      webhooks = (resolved as { webhookRegistry?: WebhookRegistry; default?: WebhookRegistry }).webhookRegistry ||
                 (resolved as { webhookRegistry?: WebhookRegistry; default?: WebhookRegistry }).default
    } else {
      webhooks = config.webhooks as WebhookRegistry
    }
  }

  // Resolve provision - can be direct object or Promise<{ default: ProvisionConfig }>
  let provision: ProvisionConfig | undefined
  if (config.provision) {
    if (config.provision instanceof Promise) {
      const resolved = await config.provision
      provision = (resolved as { default: ProvisionConfig }).default
    } else {
      provision = config.provision as ProvisionConfig
    }
  }

  return {
    ...config,
    tools,
    webhooks,
    provision,
  }
}

/**
 * Serialize a resolved config to the format stored in the database.
 *
 * This converts ToolRegistry and WebhookRegistry to their metadata-only forms,
 * stripping out handler functions.
 *
 * @param config - Fully resolved config
 * @returns Serializable config for database storage
 */
export function serializeResolvedConfig(config: ResolvedConfig): SerializableSkedyulConfig {
  return {
    name: config.name,
    version: config.version,
    description: config.description,
    computeLayer: config.computeLayer,
    tools: config.tools
      ? Object.entries(config.tools).map(([key, tool]) => ({
          name: tool.name || key,
          description: tool.description,
          timeout: tool.config?.timeout as number | undefined,
          retries: tool.config?.retries as number | undefined,
        }))
      : [],
    webhooks: config.webhooks
      ? Object.values(config.webhooks).map((w) => ({
          name: w.name,
          description: w.description,
          methods: w.methods ?? ['POST'],
          type: w.type ?? 'WEBHOOK',
        }))
      : [],
    provision: config.provision,
    agents: config.agents,
  }
}
