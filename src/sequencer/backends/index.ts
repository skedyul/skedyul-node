import { platformSequencerBackend } from './platform'
import { memorySequencerBackend, resetMemorySequencerBackendForTests } from './memory'
import type { SequencerBackend } from '../types'
import { SequencerBackendError } from '../errors'

let cachedBackend: SequencerBackend | null = null

function shouldForceMemoryBackend(): boolean {
  const flag = process.env.SKEDYUL_SEQUENCER_MEMORY
  return flag === '1' || flag === 'true'
}

/**
 * Resolve the active sequencer backend.
 * Uses platform proxy by default; falls back to in-memory when configured or on local errors.
 */
export function getSequencerBackend(): SequencerBackend {
  if (cachedBackend) {
    return cachedBackend
  }

  if (shouldForceMemoryBackend()) {
    cachedBackend = memorySequencerBackend
    return cachedBackend
  }

  cachedBackend = createResilientBackend()
  return cachedBackend
}

function createResilientBackend(): SequencerBackend {
  return {
    async allow(sequencerKey, input) {
      try {
        return await platformSequencerBackend.allow(sequencerKey, input)
      } catch (error) {
        if (shouldFallbackToMemory(error)) {
          return memorySequencerBackend.allow(sequencerKey, input)
        }
        throw error
      }
    },
    async acquire(sequencerKey, input) {
      try {
        return await platformSequencerBackend.acquire(sequencerKey, input)
      } catch (error) {
        if (shouldFallbackToMemory(error)) {
          return memorySequencerBackend.acquire(sequencerKey, input)
        }
        throw error
      }
    },
    async release(sequencerKey, leaseId) {
      if (leaseId.startsWith('mem_')) {
        return memorySequencerBackend.release(sequencerKey, leaseId)
      }
      try {
        await platformSequencerBackend.release(sequencerKey, leaseId)
      } catch (error) {
        if (shouldFallbackToMemory(error)) {
          return memorySequencerBackend.release(sequencerKey, leaseId)
        }
        throw error
      }
    },
  }
}

function shouldFallbackToMemory(error: unknown): boolean {
  if (shouldForceMemoryBackend()) {
    return true
  }
  if (error instanceof SequencerBackendError) {
    if (error.statusCode === 404 || error.statusCode === 503) {
      return true
    }
  }
  if (error instanceof TypeError) {
    return true
  }
  const nodeEnv = process.env.NODE_ENV
  return nodeEnv === 'development' || nodeEnv === 'test'
}

export function resetSequencerBackendForTests(): void {
  cachedBackend = null
}

export { platformSequencerBackend, memorySequencerBackend, resetMemorySequencerBackendForTests }
