/**
 * Rate-limit queue configuration for skedyul.config queues.
 */

export type QueueScope =
  | 'provision'
  | 'install'
  | 'provision_endpoint'
  | 'install_endpoint'
  | 'global'

/**
 * Serializable queue config (stored in DB / .skedyul/config.json).
 */
export interface SerializableQueueConfig {
  scope: QueueScope
  /** Override endpoint handle for provision_endpoint / install_endpoint scopes */
  endpoint?: string
  /** Max in-flight operations (concurrency cap) */
  maxConcurrent?: number
  /** Minimum ms between operation starts */
  minTime?: number
  /** Token bucket: max operations per refresh window */
  reservoir?: number
  reservoirRefreshAmount?: number
  reservoirRefreshInterval?: number
  /** SDK-level retries inside queuedFetch */
  maxRetries?: number
  retryDelayMs?: number
  /** Hard timeout for acquire wait + fn execution (ms) */
  timeout?: number
}

/**
 * Full queue config including non-serializable retry predicate.
 */
export interface QueueConfig extends SerializableQueueConfig {
  /** Predicate for whether a thrown error should trigger requeue */
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

export type QueueRegistry = Record<string, QueueConfig>
