import { getConfig } from '../../core/client'
import { RateLimitBackendError } from '../errors'
import type { RateLimitBackend, Lease, QueueLimits } from '../types'

interface AcquireResponse {
  leaseId: string
  acquiredAt: number
  queueKey: string
}

function getApiBaseUrl(): string {
  const config = getConfig()
  if (config.baseUrl) {
    return config.baseUrl.replace(/\/+$/, '')
  }
  return (
    process.env.SKEDYUL_API_URL ??
    process.env.SKEDYUL_NODE_URL ??
    ''
  ).replace(/\/+$/, '')
}

function getApiToken(): string {
  const config = getConfig()
  return config.apiToken || process.env.SKEDYUL_API_TOKEN || ''
}

async function callRateLimitApi<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const token = getApiToken()

  if (!baseUrl || !token) {
    throw new RateLimitBackendError(
      'SKEDYUL_API_URL and SKEDYUL_API_TOKEN are required for platform queue coordination',
    )
  }

  const response = await fetch(`${baseUrl}/api/internal/ratelimit/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean
    data?: T
    errors?: Array<{ message?: string; code?: string }>
  } | null

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.[0]?.message ??
      `Queue coordination API ${path} failed with status ${response.status}`
    throw new RateLimitBackendError(message, response.status)
  }

  if (!payload?.data) {
    throw new RateLimitBackendError(`Queue coordination API ${path} returned empty data`)
  }

  return payload.data
}

/**
 * HTTP backend that delegates acquire/release to the Skedyul platform proxy.
 */
export class PlatformRateLimitBackend implements RateLimitBackend {
  async acquire(
    queueKey: string,
    limits: QueueLimits,
    timeoutMs?: number,
  ): Promise<Lease> {
    const data = await callRateLimitApi<AcquireResponse>('acquire', {
      queueKey,
      limits,
      timeoutMs,
    })
    return {
      leaseId: data.leaseId,
      acquiredAt: data.acquiredAt,
      queueKey: data.queueKey,
    }
  }

  async release(lease: Lease): Promise<void> {
    await callRateLimitApi<{ released: boolean }>('release', {
      leaseId: lease.leaseId,
    })
  }
}

export const platformRateLimitBackend = new PlatformRateLimitBackend()
