import type { QueueInput, ResolvedQueue, ActiveQueuedOperation } from './types'
import { getQueueConfigWithRetry } from './config-loader'
import { resolveQueueKey, toQueueLimits } from './resolve-queue-key'
import {
  getRateLimitExecutionContext,
  runWithActiveQueuedOperation,
  setActiveQueuedOperationLease,
  updateActiveQueuedOperationAttempt,
  getActiveQueuedOperation,
} from './context'
import { getRateLimitBackend } from './backends'
import {
  QueueNotFoundError,
  QueueContextError,
  QueuedFetchExhaustedError,
  RequeueOutsideContextError,
  RateLimitBackendError,
  RateLimitExceededError,
} from './errors'
import { defaultShouldRetry, sleep } from './should-retry'
import type { RateLimitExecutionContext } from './types'

function normalizeQueueInput(input: QueueInput): { name: string; subKey?: string } {
  if (typeof input === 'string') {
    return { name: input }
  }
  return { name: input.queue, subKey: input.key }
}

export function resolveQueue(
  queueInput: QueueInput,
  ctxOverride?: RateLimitExecutionContext,
): ResolvedQueue {
  const ctx = ctxOverride ?? getRateLimitExecutionContext()
  if (!ctx?.app?.versionId) {
    throw new QueueContextError(
      'Cannot resolve queue without app context. Ensure queuedFetch runs inside a tool/hook handler.',
    )
  }

  const { name, subKey } = normalizeQueueInput(queueInput)
  const config = getQueueConfigWithRetry(name)
  if (!config) {
    throw new QueueNotFoundError(name)
  }

  const queueKey = resolveQueueKey(name, config, ctx, subKey)
  return {
    name,
    queueKey,
    config,
    limits: toQueueLimits(config),
  }
}

export function createQueueHandle(queueInput: QueueInput) {
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return queuedFetch(queueInput, fn)
    },
  }
}

export async function queuedFetch<T>(
  queueInput: QueueInput,
  fnOrPromise: (() => Promise<T>) | Promise<T>,
): Promise<T> {
  const fn =
    typeof fnOrPromise === 'function'
      ? fnOrPromise
      : () => fnOrPromise

  const resolved = resolveQueue(queueInput)
  const maxRetries = resolved.config.maxRetries ?? 0

  const operation: ActiveQueuedOperation<T> = {
    queueInput,
    fn,
    attempt: 0,
    resolved,
    lease: null,
  }

  return runWithActiveQueuedOperation(operation, () =>
    executeWithRetries(operation, maxRetries),
  )
}

function findPreAcquiredLease(
  queueKey: string,
  ctx?: RateLimitExecutionContext,
): { queueKey: string; leaseId: string } | undefined {
  return ctx?.preAcquiredLeases?.find((lease) => lease.queueKey === queueKey)
}

async function executeWithRetries<T>(
  operation: ActiveQueuedOperation<T>,
  maxRetries: number,
): Promise<T> {
  const backend = getRateLimitBackend()
  const timeoutMs = operation.resolved.config.timeout ?? 120_000
  const executionHoldMs = operation.resolved.config.timeout ?? timeoutMs
  const retryDelayMs = operation.resolved.config.retryDelayMs ?? 1000
  const shouldRetryFn =
    getQueueConfigWithRetry(operation.resolved.name)?.shouldRetry ??
    defaultShouldRetry

  const rateLimitCtx = getRateLimitExecutionContext()
  const preAcquired = findPreAcquiredLease(
    operation.resolved.queueKey,
    rateLimitCtx,
  )

  if (preAcquired) {
    try {
      return await operation.fn()
    } catch (error) {
      if (
        shouldRetryFn(error, operation.attempt) &&
        operation.attempt < maxRetries
      ) {
        await sleep(retryDelayMs)
        operation.attempt += 1
        updateActiveQueuedOperationAttempt(operation.attempt)
        return executeWithRetries(operation, maxRetries)
      }
      throw error
    }
  }

  let lease
  try {
    lease = await backend.acquire(
      operation.resolved.queueKey,
      operation.resolved.limits,
      timeoutMs,
      executionHoldMs,
    )
  } catch (acquireError) {
    if (
      acquireError instanceof RateLimitBackendError &&
      acquireError.statusCode === 408
    ) {
      const retryAfterMs = Math.max(
        operation.resolved.limits.minTime ?? 1000,
        operation.resolved.config.retryDelayMs ?? 1000,
      )
      throw new RateLimitExceededError(retryAfterMs)
    }
    if (
      acquireError instanceof Error &&
      acquireError.message.includes('timed out')
    ) {
      const retryAfterMs = Math.max(
        operation.resolved.limits.minTime ?? 1000,
        operation.resolved.config.retryDelayMs ?? 1000,
      )
      throw new RateLimitExceededError(retryAfterMs)
    }
    throw acquireError
  }
  operation.lease = lease
  setActiveQueuedOperationLease(lease)

  try {
    return await operation.fn()
  } catch (error) {
    await backend.release(lease)
    operation.lease = null
    setActiveQueuedOperationLease(null)

    if (
      shouldRetryFn(error, operation.attempt) &&
      operation.attempt < maxRetries
    ) {
      await sleep(retryDelayMs)
      operation.attempt += 1
      updateActiveQueuedOperationAttempt(operation.attempt)
      return executeWithRetries(operation, maxRetries)
    }

    if (
      shouldRetryFn(error, operation.attempt) &&
      operation.attempt >= maxRetries
    ) {
      throw new QueuedFetchExhaustedError(
        operation.attempt + 1,
        maxRetries,
        error,
      )
    }

    throw error
  } finally {
    if (operation.lease) {
      await backend.release(operation.lease)
      operation.lease = null
      setActiveQueuedOperationLease(null)
    }
  }
}

export async function requeue<T = unknown>(): Promise<T> {
  const operation = getActiveQueuedOperation<T>()
  if (!operation) {
    throw new RequeueOutsideContextError()
  }

  const maxRetries = operation.resolved.config.maxRetries ?? 0
  const nextAttempt = operation.attempt + 1
  if (nextAttempt > maxRetries) {
    throw new QueuedFetchExhaustedError(nextAttempt, maxRetries, undefined)
  }

  if (operation.lease) {
    const backend = getRateLimitBackend()
    await backend.release(operation.lease)
    operation.lease = null
    setActiveQueuedOperationLease(null)
  }

  operation.attempt = nextAttempt
  updateActiveQueuedOperationAttempt(nextAttempt)

  const retryDelayMs = operation.resolved.config.retryDelayMs ?? 1000
  await sleep(retryDelayMs)

  return executeWithRetries(operation, maxRetries)
}

export async function queuedFetchResponse(
  queueInput: QueueInput,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return queuedFetch(queueInput, () => fetch(url, init))
}

/** @deprecated Use createQueueHandle */
export const resolveQueueHandle = createQueueHandle
