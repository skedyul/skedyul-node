import type { SerializableSequencerConfig } from '../config/sequencer-config'

export type { RateLimitExecutionContext as SequencerExecutionContext } from '../ratelimit/types'

export type SequencerReason = 'ok' | 'stale' | 'locked' | 'disabled'

export interface SequencerSelector {
  sequencer: string
  key?: string
}

export type SequencerInput = string | SequencerSelector

export interface SequencerAllowInput {
  key?: string
  timestamp: number
  leaseId?: string
}

export interface SequencerAcquireInput {
  key?: string
  leaseId: string
  timestamp?: number
  lockTtlMs?: number
}

export interface SequencerReleaseInput {
  key?: string
  leaseId: string
}

export interface SequencerAllowResult {
  allowed: boolean
  reason: SequencerReason
  watermark?: number
}

export interface ResolvedSequencer {
  name: string
  sequencerKey: string
  config: SerializableSequencerConfig
}

export interface SequencerBackend {
  allow(
    sequencerKey: string,
    input: {
      timestamp: number
      leaseId?: string
      watermarkTtlMs?: number
    },
  ): Promise<SequencerAllowResult>
  acquire(
    sequencerKey: string,
    input: {
      leaseId: string
      timestamp?: number
      lockTtlMs?: number
      watermarkTtlMs?: number
    },
  ): Promise<{ acquired: boolean; reason: 'ok' | 'locked' }>
  release(sequencerKey: string, leaseId: string): Promise<void>
}

