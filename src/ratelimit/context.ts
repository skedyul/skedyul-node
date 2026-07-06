import { AsyncLocalStorage } from 'async_hooks'
import type { RateLimitExecutionContext, ActiveQueuedOperation } from './types'

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

/** True when petbooqz_calendar_booking holds a lease in an outer queuedFetch. */
export function isInsidePetbooqzCalendarBookingMutex(): boolean {
  return getActiveQueuedOperationStack().some(
    (operation) =>
      operation.resolved.name === 'petbooqz_calendar_booking' && operation.lease !== null,
  )
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
