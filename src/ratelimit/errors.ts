/**
 * Rate limit errors for queuedFetch.
 */

export class QueueContextError extends Error {
  readonly code = 'QUEUE_CONTEXT_ERROR'

  constructor(message: string) {
    super(message)
    this.name = 'QueueContextError'
  }
}

export class QueueNotFoundError extends Error {
  readonly code = 'QUEUE_NOT_FOUND'

  constructor(queueName: string) {
    super(`Queue "${queueName}" is not defined in skedyul.config queues`)
    this.name = 'QueueNotFoundError'
  }
}

export class QueuedFetchExhaustedError extends Error {
  readonly code = 'QUEUED_FETCH_EXHAUSTED'
  readonly attempts: number
  readonly maxRetries: number
  readonly causeError: unknown

  constructor(attempts: number, maxRetries: number, causeError: unknown) {
    super(
      `queuedFetch exhausted retries after ${attempts} attempts (maxRetries=${maxRetries})`,
    )
    this.name = 'QueuedFetchExhaustedError'
    this.attempts = attempts
    this.maxRetries = maxRetries
    this.causeError = causeError
  }
}

export class RequeueOutsideContextError extends Error {
  readonly code = 'REQUEUE_OUTSIDE_CONTEXT'

  constructor() {
    super('requeue() can only be called inside an active queuedFetch operation')
    this.name = 'RequeueOutsideContextError'
  }
}

export class RateLimitBackendError extends Error {
  readonly code = 'RATE_LIMIT_BACKEND_ERROR'
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'RateLimitBackendError'
    this.statusCode = statusCode
  }
}

/** Thrown when queuedFetch cannot acquire a rate-limit slot within the queue timeout. */
export class RateLimitExceededError extends Error {
  readonly code = 'RATE_LIMITED'
  readonly retryAfterMs: number

  constructor(retryAfterMs: number, message = 'Rate limit exceeded. Please try again later.') {
    super(message)
    this.name = 'RateLimitExceededError'
    this.retryAfterMs = retryAfterMs
  }
}
