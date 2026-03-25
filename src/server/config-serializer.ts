/**
 * Config serialization utilities for the /config endpoint.
 */

import type { SkedyulConfig, SerializableSkedyulConfig, ProvisionConfig } from '../config/app-config'
import type { ToolRegistry, WebhookRegistry } from '../types'

/**
 * Serializes a SkedyulConfig into a SerializableSkedyulConfig.
 * Used by both serverless and dedicated servers for the /config endpoint.
 * 
 * Note: provision and agents are included if they are direct objects (not promises).
 * Promise-based configs from skedyul.config.ts are resolved at build time, not runtime.
 */
export function serializeConfig(config: SkedyulConfig): SerializableSkedyulConfig {
  const registry = config.tools as ToolRegistry | undefined
  const webhookRegistry = config.webhooks as WebhookRegistry | undefined
  
  return {
    name: config.name,
    version: config.version,
    description: config.description,
    computeLayer: config.computeLayer,
    tools: registry
      ? Object.entries(registry).map(([key, tool]) => ({
          name: tool.name || key,
          description: tool.description,
          timeout: tool.timeout as number | undefined,
          retries: tool.retries as number | undefined,
        }))
      : [],
    webhooks: webhookRegistry
      ? Object.values(webhookRegistry).map((w) => ({
          name: w.name,
          description: w.description,
          methods: w.methods ?? ['POST'],
          type: w.type ?? 'WEBHOOK',
        }))
      : [],
    provision: isProvisionConfig(config.provision) ? config.provision : undefined,
    agents: config.agents,
  }
}

/**
 * Type guard to check if provision is a direct ProvisionConfig (not a promise)
 */
function isProvisionConfig(value: unknown): value is ProvisionConfig {
  return value !== undefined && value !== null && !(value instanceof Promise)
}
