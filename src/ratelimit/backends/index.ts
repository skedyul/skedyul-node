import { platformRateLimitBackend } from './platform'
import { memoryRateLimitBackend } from './memory'
import type { RateLimitBackend } from '../types'
import { RateLimitBackendError } from '../errors'

let cachedBackend: RateLimitBackend | null = null

function shouldForceMemoryBackend(): boolean {
  const flag = process.env.SKEDYUL_RATE_LIMIT_MEMORY
  return flag === '1' || flag === 'true'
}

/**
 * Resolve the active rate limit backend.
 * Uses platform proxy by default; falls back to in-memory when configured or on local errors.
 */
export function getRateLimitBackend(): RateLimitBackend {
  if (cachedBackend) {
    return cachedBackend
  }

  if (shouldForceMemoryBackend()) {
    cachedBackend = memoryRateLimitBackend
    return cachedBackend
  }

  cachedBackend = createResilientBackend()
  return cachedBackend
}

function createResilientBackend(): RateLimitBackend {
  return {
    async acquire(queueKey, limits, timeoutMs) {
      try {
        return await platformRateLimitBackend.acquire(queueKey, limits, timeoutMs)
      } catch (error) {
        if (shouldFallbackToMemory(error)) {
          return memoryRateLimitBackend.acquire(queueKey, limits, timeoutMs)
        }
        throw error
      }
    },
    async release(lease) {
      if (lease.leaseId.startsWith('mem_')) {
        return memoryRateLimitBackend.release(lease)
      }
      try {
        await platformRateLimitBackend.release(lease)
      } catch (error) {
        if (shouldFallbackToMemory(error)) {
          return memoryRateLimitBackend.release(lease)
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
  if (error instanceof RateLimitBackendError) {
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

export function resetRateLimitBackendForTests(): void {
  cachedBackend = null
}

export { platformRateLimitBackend, memoryRateLimitBackend }
