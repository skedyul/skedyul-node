import type { HealthStatus, InvocationContext } from '../types'

/**
 * Arguments passed to tool call handlers
 */
export type ToolCallArgs = {
  env?: Record<string, string | undefined>
  inputs?: Record<string, unknown>
  context?: Record<string, unknown>
  estimate?: boolean
  invocation?: InvocationContext
}

/**
 * Interface for tracking request state and health status
 */
export interface RequestState {
  incrementRequestCount(): void
  shouldShutdown(): boolean
  getHealthStatus(): HealthStatus
}

/**
 * Supported core API methods
 */
export type CoreMethod =
  | 'createCommunicationChannel'
  | 'updateCommunicationChannel'
  | 'deleteCommunicationChannel'
  | 'getCommunicationChannel'
  | 'getCommunicationChannels'
  | 'communicationChannel.list'
  | 'communicationChannel.get'
  | 'workplace.list'
  | 'workplace.get'
  | 'sendMessage'
