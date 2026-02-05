// ─────────────────────────────────────────────────────────────────────────────
// Ngrok Tunnel Management
// ─────────────────────────────────────────────────────────────────────────────

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

  try {
    const listener = await ngrok.forward({
      addr: config.port,
      authtoken: config.authToken,
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
      if (error.message.includes('authtoken')) {
        throw new Error(
          'ngrok requires authentication. Get a free authtoken at https://ngrok.com\n' +
          'Then set it with: ngrok config add-authtoken <token>',
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
