import { AsyncLocalStorage } from 'async_hooks'
import type { RateLimitExecutionContext, ActiveQueuedOperation } from './types'

const executionContextStorage = new AsyncLocalStorage<RateLimitExecutionContext>()
const activeOperationStorage = new AsyncLocalStorage<ActiveQueuedOperation<unknown>>()

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
  return activeOperationStorage.run(operation as ActiveQueuedOperation<unknown>, fn)
}

export function getActiveQueuedOperation<T>(): ActiveQueuedOperation<T> | undefined {
  return activeOperationStorage.getStore() as ActiveQueuedOperation<T> | undefined
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
