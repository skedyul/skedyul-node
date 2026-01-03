import type { CommunicationChannel, Workplace } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

type ClientConfig = {
  /** Base URL for the Skedyul Core API (e.g., "https://app.skedyul.com/api") */
  baseUrl: string
  /** API token (sk_app_* for App API or sk_wkp_* for Workplace API) */
  apiToken: string
}

let config: ClientConfig = {
  baseUrl: process.env.SKEDYUL_API_URL ?? process.env.SKEDYUL_NODE_URL ?? '',
  apiToken: process.env.SKEDYUL_API_TOKEN ?? '',
}

/**
 * Configure the Skedyul client.
 *
 * Can be called to override environment variables, or to set config at runtime.
 *
 * @example
 * ```ts
 * import { configure } from 'skedyul';
 *
 * configure({
 *   baseUrl: 'https://app.skedyul.com/api',
 *   apiToken: 'sk_app_xxxxx',
 * });
 * ```
 */
export function configure(options: Partial<ClientConfig>): void {
  config = {
    ...config,
    ...options,
  }
}

/**
 * Get the current client configuration.
 */
export function getConfig(): Readonly<ClientConfig> {
  return config
}

// ─────────────────────────────────────────────────────────────────────────────
// Core API Client
// ─────────────────────────────────────────────────────────────────────────────

async function callCore(
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const { baseUrl, apiToken } = config

  if (!baseUrl) {
    throw new Error(
      'Skedyul client not configured: missing baseUrl. Set SKEDYUL_API_URL environment variable or call configure().',
    )
  }

  if (!apiToken) {
    throw new Error(
      'Skedyul client not configured: missing apiToken. Set SKEDYUL_API_TOKEN environment variable or call configure().',
    )
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiToken}`,
  }

  const response = await fetch(`${baseUrl}/core`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method, params }),
  })

  const payload = (await response.json()) as {
    error?: { message?: string }
    [key: string]: unknown
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? `Core API error (${response.status})`,
    )
  }

  return payload
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Clients
// ─────────────────────────────────────────────────────────────────────────────

type ListArgs = {
  filter?: Record<string, unknown>
  limit?: number
}

export const workplace = {
  async list(args?: ListArgs): Promise<Workplace[]> {
    const payload = (await callCore('workplace.list', {
      ...(args?.filter ? { filter: args.filter } : {}),
      ...(args?.limit ? { limit: args.limit } : {}),
    })) as { workplaces: Workplace[] }
    return payload.workplaces
  },

  async get(id: string): Promise<Workplace> {
    const payload = (await callCore('workplace.get', { id })) as {
      workplace: Workplace
    }
    return payload.workplace
  },
}

export const communicationChannel = {
  /**
   * List communication channels with optional filters.
   *
   * @example
   * ```ts
   * // Find channel by phone number
   * const channels = await communicationChannel.list({
   *   filter: { identifierValue: '+1234567890' },
   *   limit: 1,
   * });
   * ```
   */
  async list(args?: ListArgs): Promise<CommunicationChannel[]> {
    const payload = (await callCore('communicationChannel.list', {
      ...(args?.filter ? { filter: args.filter } : {}),
      ...(args?.limit ? { limit: args.limit } : {}),
    })) as { channels: CommunicationChannel[] }
    return payload.channels
  },

  async get(id: string): Promise<CommunicationChannel | null> {
    const payload = (await callCore('communicationChannel.get', { id })) as {
      channel: CommunicationChannel | null
    }
    return payload.channel
  },
}
