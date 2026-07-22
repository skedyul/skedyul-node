import type { SequencerBackend, SequencerAllowResult } from '../types'

interface MemorySequencerState {
  watermark: number
  lockLeaseId: string | null
  lockExpiresAt: number
}

function generateLeaseId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * In-process sequencer backend for local development and tests.
 */
export class MemorySequencerBackend implements SequencerBackend {
  private readonly state = new Map<string, MemorySequencerState>()

  private getState(sequencerKey: string): MemorySequencerState {
    let state = this.state.get(sequencerKey)
    if (!state) {
      state = { watermark: 0, lockLeaseId: null, lockExpiresAt: 0 }
      this.state.set(sequencerKey, state)
    }
    if (state.lockLeaseId && state.lockExpiresAt <= Date.now()) {
      state.lockLeaseId = null
      state.lockExpiresAt = 0
    }
    return state
  }

  async allow(
    sequencerKey: string,
    input: {
      timestamp: number
      leaseId?: string
      watermarkTtlMs?: number
    },
  ): Promise<SequencerAllowResult> {
    void input.watermarkTtlMs
    const state = this.getState(sequencerKey)
    if (input.timestamp < state.watermark) {
      return { allowed: false, reason: 'stale', watermark: state.watermark }
    }
    if (
      state.lockLeaseId &&
      input.leaseId &&
      state.lockLeaseId !== input.leaseId
    ) {
      return { allowed: false, reason: 'locked', watermark: state.watermark }
    }
    state.watermark = Math.max(state.watermark, input.timestamp)
    return { allowed: true, reason: 'ok', watermark: state.watermark }
  }

  async acquire(
    sequencerKey: string,
    input: {
      leaseId: string
      timestamp?: number
      lockTtlMs?: number
      watermarkTtlMs?: number
    },
  ): Promise<{ acquired: boolean; reason: 'ok' | 'locked' }> {
    void input.watermarkTtlMs
    const state = this.getState(sequencerKey)
    const leaseId = input.leaseId || generateLeaseId()
    if (state.lockLeaseId && state.lockLeaseId !== leaseId) {
      return { acquired: false, reason: 'locked' }
    }
    state.lockLeaseId = leaseId
    state.lockExpiresAt = Date.now() + (input.lockTtlMs ?? 60_000)
    if (input.timestamp !== undefined) {
      state.watermark = Math.max(state.watermark, input.timestamp)
    }
    return { acquired: true, reason: 'ok' }
  }

  async release(sequencerKey: string, leaseId: string): Promise<void> {
    const state = this.state.get(sequencerKey)
    if (!state || state.lockLeaseId !== leaseId) {
      return
    }
    state.lockLeaseId = null
    state.lockExpiresAt = 0
  }

  resetForTests(): void {
    this.state.clear()
  }
}

export const memorySequencerBackend = new MemorySequencerBackend()

export function resetMemorySequencerBackendForTests(): void {
  memorySequencerBackend.resetForTests()
}
