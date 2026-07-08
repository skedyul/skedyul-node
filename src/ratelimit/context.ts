import { AsyncLocalStorage } from 'async_hooks'
import type { RateLimitExecutionContext, ActiveQueuedOperation } from './types'
import { getQueueConfigWithRetry } from './config-loader'

const executionContextStorage = new AsyncLocalStorage<RateLimitExecutionContext>()
const activeOperationStorage = new AsyncLocalStorage<ActiveQueuedOperation<unknown>>()
const activeOperationStackStorage =
  new AsyncLocalStorage<ActiveQueuedOperation<unknown>[]>()

export function runWithRateLimitExecutionContext<T>(
  ctx: RateLimitExecutionContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return executionContextStorage.run(ctx, fn)
}

export function getRateLimitExecutionContext(): RateLimitExecutionContext | undefined {
  return executionContextStorage.getStore()
}

export function runWithActiveQueuedOperation<T>(
  operation: ActiveQueuedOperation<T>,
  fn: () => Promise<T>,
): Promise<T> {
  const parentStack = activeOperationStackStorage.getStore() ?? []
  const stack = [...parentStack, operation as ActiveQueuedOperation<unknown>]

  return activeOperationStorage.run(operation as ActiveQueuedOperation<unknown>, () =>
    activeOperationStackStorage.run(stack, fn),
  )
}

export function getActiveQueuedOperation<T>(): ActiveQueuedOperation<T> | undefined {
  return activeOperationStorage.getStore() as ActiveQueuedOperation<T> | undefined
}

export function getActiveQueuedOperationStack(): ActiveQueuedOperation<unknown>[] {
  return activeOperationStackStorage.getStore() ?? []
}

/** Active mutex queue names holding a lease in an outer queuedFetch. */
export function getActiveMutexQueueNames(): string[] {
  const names = new Set<string>()

  for (const operation of getActiveQueuedOperationStack()) {
    if (operation.lease === null) {
      continue
    }
    const config = getQueueConfigWithRetry(operation.resolved.name)
    if (config?.mutex === true) {
      names.add(operation.resolved.name)
    }
  }

  return [...names]
}

/** True when an active mutex queue suppresses acquire for the target queue name. */
export function shouldSkipNestedAcquire(queueName: string): boolean {
  for (const mutexQueueName of getActiveMutexQueueNames()) {
    const config = getQueueConfigWithRetry(mutexQueueName)
    if (config?.suppressesQueues?.includes(queueName)) {
      return true
    }
  }
  return false
}

export function setActiveQueuedOperationLease(
  lease: ActiveQueuedOperation<unknown>['lease'],
): void {
  const op = activeOperationStorage.getStore()
  if (op) {
    op.lease = lease
  }
}

export function updateActiveQueuedOperationAttempt(attempt: number): void {
  const op = activeOperationStorage.getStore()
  if (op) {
    op.attempt = attempt
  }
}
