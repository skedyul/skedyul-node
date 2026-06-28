import type { RateLimitBackend, Lease, QueueLimits } from '../types'

interface QueueState {
  running: number
  waiters: Array<{
    resolve: (lease: Lease) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout> | null
    limits: QueueLimits
  }>
  lastStartAt: number
  tokens: number
  lastRefillAt: number
}

const DEFAULT_MAX_CONCURRENT = 10

function getMaxConcurrent(limits: QueueLimits): number {
  return limits.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
}

function getMinTime(limits: QueueLimits): number {
  return limits.minTime ?? 0
}

function generateLeaseId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function refillTokens(state: QueueState, limits: QueueLimits): void {
  if (limits.reservoir === undefined) {
    return
  }
  const capacity = limits.reservoir
  const refreshAmount = limits.reservoirRefreshAmount ?? limits.reservoir
  const refreshInterval = limits.reservoirRefreshInterval ?? 60_000
  const now = Date.now()
  const elapsed = now - state.lastRefillAt
  if (elapsed >= refreshInterval) {
    const intervals = Math.floor(elapsed / refreshInterval)
    state.tokens = Math.min(capacity, state.tokens + intervals * refreshAmount)
    state.lastRefillAt = now
  }
}

function canAcquire(state: QueueState, limits: QueueLimits): boolean {
  if (state.running >= getMaxConcurrent(limits)) {
    return false
  }
  refillTokens(state, limits)
  if (limits.reservoir !== undefined && state.tokens <= 0) {
    return false
  }
  const minTime = getMinTime(limits)
  if (minTime > 0 && state.lastStartAt > 0) {
    if (Date.now() - state.lastStartAt < minTime) {
      return false
    }
  }
  return true
}

/**
 * In-process rate limit backend for local development.
 */
export class MemoryRateLimitBackend implements RateLimitBackend {
  private readonly queues = new Map<string, QueueState>()
  private readonly leases = new Map<string, { queueKey: string; limits: QueueLimits }>()

  private getState(queueKey: string): QueueState {
    let state = this.queues.get(queueKey)
    if (!state) {
      state = {
        running: 0,
        waiters: [],
        lastStartAt: 0,
        tokens: Number.POSITIVE_INFINITY,
        lastRefillAt: Date.now(),
      }
      if (queueKey.includes(':')) {
        // noop — key exists for map lookup
      }
      this.queues.set(queueKey, state)
    }
    return state
  }

  private grant(state: QueueState, queueKey: string, limits: QueueLimits): Lease {
    if (limits.reservoir !== undefined) {
      state.tokens -= 1
    }
    state.running += 1
    state.lastStartAt = Date.now()
    const leaseId = generateLeaseId()
    this.leases.set(leaseId, { queueKey, limits })
    return { leaseId, acquiredAt: Date.now(), queueKey }
  }

  private drainWaiters(queueKey: string, state: QueueState): void {
    let progressed = true
    while (progressed && state.waiters.length > 0) {
      progressed = false
      for (let i = 0; i < state.waiters.length; i += 1) {
        const waiter = state.waiters[i]
        if (!waiter || !canAcquire(state, waiter.limits)) {
          continue
        }
        state.waiters.splice(i, 1)
        if (waiter.timer) {
          clearTimeout(waiter.timer)
        }
        waiter.resolve(this.grant(state, queueKey, waiter.limits))
        progressed = true
        break
      }
    }
  }

  async acquire(
    queueKey: string,
    limits: QueueLimits,
    timeoutMs = 120_000,
  ): Promise<Lease> {
    const state = this.getState(queueKey)
    if (limits.reservoir !== undefined && state.tokens === Number.POSITIVE_INFINITY) {
      state.tokens = limits.reservoir
    }

    if (canAcquire(state, limits)) {
      return this.grant(state, queueKey, limits)
    }

    return new Promise<Lease>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: null as ReturnType<typeof setTimeout> | null,
        limits,
      }

      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const idx = state.waiters.indexOf(waiter)
          if (idx >= 0) {
            state.waiters.splice(idx, 1)
          }
          reject(
            new Error(`Queue slot acquire timed out after ${timeoutMs}ms for ${queueKey}`),
          )
        }, timeoutMs)
      }

      state.waiters.push(waiter)

      const retry = (): void => {
        if (!state.waiters.includes(waiter)) {
          return
        }
        if (canAcquire(state, limits)) {
          const idx = state.waiters.indexOf(waiter)
          if (idx >= 0) {
            state.waiters.splice(idx, 1)
          }
          if (waiter.timer) {
            clearTimeout(waiter.timer)
          }
          resolve(this.grant(state, queueKey, limits))
          return
        }
        setTimeout(retry, Math.max(getMinTime(limits), 10))
      }

      setTimeout(retry, Math.max(getMinTime(limits), 10))
    })
  }

  async release(lease: Lease): Promise<void> {
    const tracked = this.leases.get(lease.leaseId)
    this.leases.delete(lease.leaseId)
    const queueKey = tracked?.queueKey ?? lease.queueKey
    const state = this.queues.get(queueKey)
    if (!state) {
      return
    }
    state.running = Math.max(0, state.running - 1)
    this.drainWaiters(queueKey, state)
  }
}

export const memoryRateLimitBackend = new MemoryRateLimitBackend()
