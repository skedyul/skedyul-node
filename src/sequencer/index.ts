import type {
  SequencerInput,
  SequencerAllowInput,
  SequencerAcquireInput,
  SequencerReleaseInput,
  SequencerAllowResult,
  ResolvedSequencer,
} from './types'
import type { RateLimitExecutionContext } from '../ratelimit/types'
import { getSequencerConfig } from './config-loader'
import { resolveSequencerKey } from './resolve-sequencer-key'
import { getRateLimitExecutionContext } from '../ratelimit/context'
import { getSequencerBackend } from './backends'
import {
  SequencerContextError,
  SequencerNotFoundError,
  SequencerLockError,
} from './errors'

function normalizeSequencerInput(input: SequencerInput): { name: string; subKey?: string } {
  if (typeof input === 'string') {
    return { name: input }
  }
  return { name: input.sequencer, subKey: input.key }
}

function mergeContext(
  ctxOverride?: Partial<RateLimitExecutionContext>,
): RateLimitExecutionContext {
  const ctx = getRateLimitExecutionContext()
  if (!ctx?.app?.versionId) {
    throw new SequencerContextError(
      'Cannot resolve sequencer without app context. Ensure sequencer runs inside a tool/hook/webhook handler.',
    )
  }
  return { ...ctx, ...ctxOverride }
}

export function resolveSequencer(
  sequencerInput: SequencerInput,
  ctxOverride?: Partial<RateLimitExecutionContext>,
): ResolvedSequencer {
  const ctx = mergeContext(ctxOverride)
  const { name, subKey } = normalizeSequencerInput(sequencerInput)
  const config = getSequencerConfig(name)
  if (!config) {
    throw new SequencerNotFoundError(name)
  }

  const sequencerKey = resolveSequencerKey(name, config, ctx, subKey)
  return { name, sequencerKey, config }
}

export function createSequencerHandle(
  sequencerInput: SequencerInput,
  ctxOverride?: Partial<RateLimitExecutionContext>,
) {
  return {
    allow(input: Omit<SequencerAllowInput, 'key'>): Promise<SequencerAllowResult> {
      return allow(sequencerInput, input, ctxOverride)
    },
    acquire(input: Omit<SequencerAcquireInput, 'key'>): Promise<void> {
      return acquire(sequencerInput, input, ctxOverride)
    },
    release(input: Omit<SequencerReleaseInput, 'key'>): Promise<void> {
      return release(sequencerInput, input, ctxOverride)
    },
  }
}

function disabledAllowResult(): SequencerAllowResult {
  return { allowed: true, reason: 'disabled' }
}

export async function allow(
  sequencerInput: SequencerInput,
  input: SequencerAllowInput,
  ctxOverride?: Partial<RateLimitExecutionContext>,
): Promise<SequencerAllowResult> {
  const { name, subKey } = normalizeSequencerInput(sequencerInput)
  const config = getSequencerConfig(name)
  if (!config || config.enabled !== true) {
    return disabledAllowResult()
  }

  const resolvedSubKey = input.key ?? subKey
  const resolved = resolveSequencer(
    { sequencer: name, key: resolvedSubKey },
    ctxOverride,
  )
  const backend = getSequencerBackend()
  return backend.allow(resolved.sequencerKey, {
    timestamp: input.timestamp,
    leaseId: input.leaseId,
    watermarkTtlMs: resolved.config.watermarkTtlMs,
  })
}

export async function acquire(
  sequencerInput: SequencerInput,
  input: SequencerAcquireInput,
  ctxOverride?: Partial<RateLimitExecutionContext>,
): Promise<void> {
  const { name, subKey } = normalizeSequencerInput(sequencerInput)
  const config = getSequencerConfig(name)
  if (!config || config.enabled !== true) {
    return
  }

  const resolvedSubKey = input.key ?? subKey
  const resolved = resolveSequencer(
    { sequencer: name, key: resolvedSubKey },
    ctxOverride,
  )
  const backend = getSequencerBackend()
  const result = await backend.acquire(resolved.sequencerKey, {
    leaseId: input.leaseId,
    timestamp: input.timestamp,
    lockTtlMs: input.lockTtlMs ?? resolved.config.lockTtlMs,
    watermarkTtlMs: resolved.config.watermarkTtlMs,
  })
  if (!result.acquired) {
    throw new SequencerLockError(
      `Sequencer "${name}" lock held by another lease (${result.reason})`,
    )
  }
}

export async function release(
  sequencerInput: SequencerInput,
  input: SequencerReleaseInput,
  ctxOverride?: Partial<RateLimitExecutionContext>,
): Promise<void> {
  const { name, subKey } = normalizeSequencerInput(sequencerInput)
  const config = getSequencerConfig(name)
  if (!config || config.enabled !== true) {
    return
  }

  const resolvedSubKey = input.key ?? subKey
  const resolved = resolveSequencer(
    { sequencer: name, key: resolvedSubKey },
    ctxOverride,
  )
  const backend = getSequencerBackend()
  await backend.release(resolved.sequencerKey, input.leaseId)
}

export {
  registerSequencerConfig,
  clearRegisteredSequencerConfig,
  getSequencerConfig,
  getSequencerDefinitions,
} from './config-loader'
export { resolveSequencerKey } from './resolve-sequencer-key'
export {
  getSequencerBackend,
  resetSequencerBackendForTests,
  memorySequencerBackend,
  platformSequencerBackend,
  resetMemorySequencerBackendForTests,
} from './backends'
export {
  SequencerContextError,
  SequencerNotFoundError,
  SequencerBackendError,
  SequencerLockError,
} from './errors'
export type {
  SequencerInput,
  SequencerSelector,
  SequencerAllowInput,
  SequencerAcquireInput,
  SequencerReleaseInput,
  SequencerAllowResult,
  ResolvedSequencer,
  SequencerBackend,
  SequencerReason,
  SequencerExecutionContext,
} from './types'
export type {
  SequencerScope,
  SerializableSequencerConfig,
  SequencerRegistry,
} from '../config/sequencer-config'
export const sequencer = {
  allow,
  acquire,
  release,
  resolve: resolveSequencer,
  createHandle: createSequencerHandle,
}
