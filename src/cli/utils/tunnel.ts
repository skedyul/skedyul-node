// ─────────────────────────────────────────────────────────────────────────────
// Ngrok Tunnel Management
// ─────────────────────────────────────────────────────────────────────────────

import { getNgrokAuthtoken } from './auth'

export interface TunnelConfig {
  port: number
  authToken?: string
}

export interface TunnelConnection {
  url: string
  disconnect: () => Promise<void>
}

/**
 * Start an ngrok tunnel to expose a local port.
 * Requires @ngrok/ngrok to be installed as a dev dependency.
 * 
 * Authtoken priority:
 * 1. Passed in config.authToken
 * 2. Stored in ~/.skedyul/config.json (ngrokAuthtoken)
 * 3. ngrok's own config (~/.ngrok2/ngrok.yml)
 */
export async function startTunnel(config: TunnelConfig): Promise<TunnelConnection> {
  let ngrok: { forward: (opts: { addr: number; authtoken?: string }) => Promise<{ url: () => string | null; close: () => Promise<void> }> }

  try {
    // Dynamically import ngrok (dev dependency)
    ngrok = await import('@ngrok/ngrok')
  } catch {
    throw new Error(
      'ngrok is required for tunneling. Install it with:\n' +
      '  npm install --save-dev @ngrok/ngrok\n' +
      '  # or\n' +
      '  pnpm add -D @ngrok/ngrok',
    )
  }

  // Get authtoken: passed > skedyul config > ngrok's own config (undefined lets ngrok use its config)
  const authtoken = config.authToken || getNgrokAuthtoken()

  try {
    const listener = await ngrok.forward({
      addr: config.port,
      authtoken,
    })

    const url = listener.url()
    if (!url) {
      throw new Error('Failed to get tunnel URL')
    }

    return {
      url,
      disconnect: async () => {
        await listener.close()
      },
    }
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message

      // Handle authtoken missing
      if (message.includes('authtoken')) {
        throw new Error(
          'ngrok requires authentication. Get a free authtoken at https://ngrok.com\n' +
          'Then set it with:\n' +
          '  skedyul config set ngrokAuthtoken <token>\n' +
          '  # or\n' +
          '  ngrok config add-authtoken <token>',
        )
      }

      // Handle session limit (ERR_NGROK_108)
      if (message.includes('ERR_NGROK_108') || message.includes('simultaneous ngrok agent')) {
        throw new Error(
          'ngrok free tier only allows 1 simultaneous session.\n\n' +
          'Options:\n' +
          '  1. Kill other ngrok sessions:\n' +
          '     - Check running sessions: https://dashboard.ngrok.com/agents\n' +
          '     - Or run: pkill -f ngrok\n\n' +
          '  2. Use an existing tunnel URL:\n' +
          '     skedyul dev serve --workplace <name> --tunnel-url <url>\n\n' +
          '  3. Upgrade to a paid ngrok plan:\n' +
          '     https://dashboard.ngrok.com/billing/choose-a-plan',
        )
      }

      throw error
    }
    throw new Error(`Failed to start tunnel: ${String(error)}`)
  }
}

/**
 * Check if ngrok is installed and available.
 */
export async function isNgrokAvailable(): Promise<boolean> {
  try {
    await import('@ngrok/ngrok')
    return true
  } catch {
    return false
  }
}
