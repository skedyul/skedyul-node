import type { InvocationContext } from '../types/invocation'
import type { SerializableQueueConfig } from '../config/queue-config'
import type { RateLimitExecutionContext } from './types'
import { QueueContextError } from './errors'

function resolveEndpointHandle(
  config: SerializableQueueConfig,
  invocation?: InvocationContext,
): string {
  if (config.endpoint) {
    return config.endpoint
  }
  if (invocation?.toolHandle) {
    return invocation.toolHandle
  }
  if (invocation?.serverHookHandle) {
    return invocation.serverHookHandle
  }
  throw new QueueContextError(
    `Cannot resolve endpoint handle for queue scope "${config.scope}". ` +
      'Set endpoint in queue config or ensure invocation.toolHandle/serverHookHandle is available.',
  )
}

function appendSubKey(base: string, subKey?: string): string {
  return subKey ? `${base}:${subKey}` : base
}

/**
 * Build the Redis queue key for a named queue definition.
 * Must stay in sync with skedyul-core rate limit validation.
 */
export function resolveQueueKey(
  queueName: string,
  config: SerializableQueueConfig,
  ctx: RateLimitExecutionContext,
  subKey?: string,
): string {
  const { app, appInstallationId, invocation, isProvisionContext } = ctx

  switch (config.scope) {
    case 'provision': {
      const base = `rl:pv:${app.versionId}:${queueName}`
      return appendSubKey(base, subKey)
    }
    case 'install': {
      if (!appInstallationId) {
        throw new QueueContextError(
          `Queue "${queueName}" with scope "install" requires appInstallationId in context`,
        )
      }
      const base = `rl:in:${appInstallationId}:${queueName}`
      return appendSubKey(base, subKey)
    }
    case 'provision_endpoint': {
      if (!isProvisionContext && appInstallationId) {
        throw new QueueContextError(
          `Queue "${queueName}" with scope "provision_endpoint" requires provision context (no install)`,
        )
      }
      const endpointHandle = resolveEndpointHandle(config, invocation)
      const base = `rl:pep:${app.versionId}:${endpointHandle}:${queueName}`
      return appendSubKey(base, subKey)
    }
    case 'install_endpoint': {
      if (!appInstallationId) {
        throw new QueueContextError(
          `Queue "${queueName}" with scope "install_endpoint" requires appInstallationId in context`,
        )
      }
      const endpointHandle = resolveEndpointHandle(config, invocation)
      const base = `rl:iep:${appInstallationId}:${endpointHandle}:${queueName}`
      return appendSubKey(base, subKey)
    }
    case 'global': {
      const base = `rl:gl:${app.versionId}:${queueName}`
      return appendSubKey(base, subKey)
    }
    default: {
      const _exhaustive: never = config.scope
      throw new QueueContextError(`Unknown queue scope: ${String(_exhaustive)}`)
    }
  }
}

export function toQueueLimits(config: SerializableQueueConfig) {
  return {
    maxConcurrent: config.maxConcurrent,
    minTime: config.minTime,
    reservoir: config.reservoir,
    reservoirRefreshAmount: config.reservoirRefreshAmount,
    reservoirRefreshInterval: config.reservoirRefreshInterval,
  }
}
