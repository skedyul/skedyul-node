import type { SerializableQueueConfig } from '../config/queue-config'
import type { AppInfo } from '../types/shared'
import type { InvocationContext } from '../types/invocation'

export interface RateLimitExecutionContext {
  app: AppInfo
  appInstallationId?: string
  invocation?: InvocationContext
  isProvisionContext?: boolean
}

export interface QueueSelector {
  queue: string
  key?: string
}

export type QueueInput = string | QueueSelector

export interface Lease {
  leaseId: string
  acquiredAt: number
  queueKey: string
}

export interface QueueLimits {
  maxConcurrent?: number
  minTime?: number
  reservoir?: number
  reservoirRefreshAmount?: number
  reservoirRefreshInterval?: number
}

export interface ResolvedQueue {
  name: string
  queueKey: string
  config: SerializableQueueConfig
  limits: QueueLimits
}

export interface RateLimitBackend {
  acquire(
    queueKey: string,
    limits: QueueLimits,
    timeoutMs?: number,
  ): Promise<Lease>
  release(lease: Lease): Promise<void>
}

export interface ActiveQueuedOperation<T> {
  queueInput: QueueInput
  fn: () => Promise<T>
  attempt: number
  resolved: ResolvedQueue
  lease: Lease | null
}
