/**
 * Sequencer configuration for skedyul.config sequencers.
 */

import type { QueueScope } from './queue-config'

export type SequencerScope = QueueScope

/**
 * Serializable sequencer config (stored in DB / .skedyul/config.json).
 */
export interface SerializableSequencerConfig {
  scope: SequencerScope
  /** Override endpoint handle for provision_endpoint / install_endpoint scopes */
  endpoint?: string
  /** Opt-in per named sequencer (default false) */
  enabled?: boolean
  /** Lock TTL for acquire() — default 60_000 ms */
  lockTtlMs?: number
  /** Watermark key TTL in Redis — default 7 days */
  watermarkTtlMs?: number
}

export type SequencerRegistry = Record<string, SerializableSequencerConfig>
