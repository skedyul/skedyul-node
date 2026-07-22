import { getConfig } from '../../core/client'
import { SequencerBackendError } from '../errors'
import type { SequencerBackend, SequencerAllowResult } from '../types'

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

async function callSequencerApi<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const token = getApiToken()

  if (!baseUrl || !token) {
    throw new SequencerBackendError(
      'SKEDYUL_API_URL and SKEDYUL_API_TOKEN are required for platform sequencer coordination',
    )
  }

  const response = await fetch(`${baseUrl}/api/internal/sequencer/${path}`, {
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
      `Sequencer coordination API ${path} failed with status ${response.status}`
    throw new SequencerBackendError(message, response.status)
  }

  if (!payload?.data) {
    throw new SequencerBackendError(`Sequencer coordination API ${path} returned empty data`)
  }

  return payload.data
}

/**
 * HTTP backend that delegates allow/acquire/release to the Skedyul platform proxy.
 */
export class PlatformSequencerBackend implements SequencerBackend {
  async allow(
    sequencerKey: string,
    input: {
      timestamp: number
      leaseId?: string
      watermarkTtlMs?: number
    },
  ): Promise<SequencerAllowResult> {
    return callSequencerApi<SequencerAllowResult>('allow', {
      sequencerKey,
      timestamp: input.timestamp,
      leaseId: input.leaseId,
      watermarkTtlMs: input.watermarkTtlMs,
    })
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
    return callSequencerApi<{ acquired: boolean; reason: 'ok' | 'locked' }>('acquire', {
      sequencerKey,
      leaseId: input.leaseId,
      timestamp: input.timestamp,
      lockTtlMs: input.lockTtlMs,
      watermarkTtlMs: input.watermarkTtlMs,
    })
  }

  async release(sequencerKey: string, leaseId: string): Promise<void> {
    await callSequencerApi<{ released: boolean }>('release', {
      sequencerKey,
      leaseId,
    })
  }
}

export const platformSequencerBackend = new PlatformSequencerBackend()
