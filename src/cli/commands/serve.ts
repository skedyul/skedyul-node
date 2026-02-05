import {
  parseArgs,
  parseEnvFlags,
  loadEnvFile as loadEnvFileFromPath,
  loadRegistry,
} from '../utils'
import { createSkedyulServer } from '../../server'
import type { DedicatedServerInstance } from '../../types'
import { getCredentials, callCliApi } from '../utils/auth'
import { getLinkConfig, loadEnvFile as loadLinkedEnvFile } from '../utils/link'
import { findRegistryPath } from '../utils/config'
import { startTunnel, isNgrokAvailable } from '../utils/tunnel'
import type { TunnelConnection } from '../utils/tunnel'

function printHelp(): void {
  console.log(`
skedyul dev serve - Start a local MCP server for testing

Usage:
  skedyul dev serve [options]

Modes:
  Standalone Mode (default):
    Run the server locally without connecting to Skedyul.
    Useful for quick local testing.

  Sidecar Mode (--linked):
    Connect to Skedyul as a local development environment.
    Skedyul routes tool calls to your local machine via ngrok tunnel.

Options:
  --registry, -r      Path to the registry file (default: ./dist/registry.js)
  --port, -p          Port to listen on (default: 3000)
  --name              Server name for MCP metadata (default: 'Local Dev Server')
  --version           Server version for MCP metadata (default: '0.0.1')
  --env, -e           Set environment variable (can be used multiple times)
                      Format: --env KEY=VALUE
  --env-file          Load environment variables from a file
  --help, -h          Show this help message

Sidecar Mode Options:
  --linked            Enable sidecar mode (connect to Skedyul)
  --workplace, -w     Workplace subdomain (required with --linked)
  --no-tunnel         Don't start ngrok tunnel (use with external tunnel)
  --tunnel-url        Use existing tunnel URL instead of starting new one

Examples:
  # Standalone mode
  skedyul dev serve --registry ./dist/registry.js

  # Sidecar mode with ngrok tunnel
  skedyul dev serve --linked --workplace demo-clinic

  # Sidecar mode with existing tunnel
  skedyul dev serve --linked --workplace demo-clinic \\
    --tunnel-url https://abc123.ngrok.io

Endpoints:
  POST /mcp            MCP JSON-RPC endpoint (tools/list, tools/call)
  GET  /health         Health check endpoint
  POST /estimate       Estimate billing for a tool call
  POST /core           Core API methods (if configured)
`)
}

import * as net from 'net'

const HEARTBEAT_INTERVAL_MS = 30 * 1000 // 30 seconds
const DEFAULT_PORT = 60000
const MAX_PORT_ATTEMPTS = 100

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + MAX_PORT_ATTEMPTS; port++) {
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error(`No available port found between ${startPort} and ${startPort + MAX_PORT_ATTEMPTS}`)
}

export async function serveCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const isLinked = flags.linked === true
  const workplaceSubdomain = (flags.workplace || flags.w) as string | undefined

  // Validate sidecar mode requirements
  if (isLinked && !workplaceSubdomain) {
    console.error('Error: --workplace is required with --linked')
    console.error("Run 'skedyul dev serve --help' for usage information.")
    process.exit(1)
  }

  // Get registry path - auto-detect if not specified
  let registryPath = (flags.registry || flags.r) as string | undefined
  if (!registryPath) {
    registryPath = findRegistryPath() ?? './dist/registry.js'
  }

  // Get port - start at 60000 and find available port
  let requestedPort = DEFAULT_PORT
  const portFlag = flags.port || flags.p
  if (portFlag && typeof portFlag === 'string') {
    const parsed = parseInt(portFlag, 10)
    if (!isNaN(parsed)) {
      requestedPort = parsed
    }
  }

  // Find an available port
  let port: number
  try {
    port = await findAvailablePort(requestedPort)
    if (port !== requestedPort) {
      console.log(`Port ${requestedPort} in use, using ${port} instead`)
    }
  } catch (error) {
    console.error(`Failed to find available port: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  // Get server metadata
  const serverName = (flags.name || 'Local Dev Server') as string
  const serverVersion = (flags.version || '0.0.1') as string

  // Build environment from --env-file
  const envFilePath = flags['env-file']
  if (envFilePath && typeof envFilePath === 'string') {
    try {
      const fileEnv = loadEnvFileFromPath(envFilePath)
      Object.assign(process.env, fileEnv)
    } catch (error) {
      console.error(`Error loading env file: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  // Parse --env flags from raw args
  const cliEnv = parseEnvFlags(args)
  Object.assign(process.env, cliEnv)

  // Sidecar mode setup
  let linkConfig: ReturnType<typeof getLinkConfig> = null
  let credentials: ReturnType<typeof getCredentials> = null
  let tunnel: TunnelConnection | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null

  if (isLinked && workplaceSubdomain) {
    // Check authentication
    credentials = getCredentials()
    if (!credentials) {
      console.error('Error: Not logged in.')
      console.error("Run 'skedyul auth login' to authenticate first.")
      process.exit(1)
    }

    // Check link config
    linkConfig = getLinkConfig(workplaceSubdomain)
    if (!linkConfig) {
      console.error(`Error: Not linked to ${workplaceSubdomain}`)
      console.error(`Run 'skedyul dev link --workplace ${workplaceSubdomain}' first.`)
      process.exit(1)
    }

    console.log(`Loading link from .skedyul/links/${workplaceSubdomain}.json`)
    console.log(`  App: ${linkConfig.appHandle}`)
    console.log(`  Workplace: ${linkConfig.workplaceSubdomain}`)
    console.log(`  AppVersion: ${linkConfig.appVersionHandle}`)

    // Load env vars for this workplace
    const linkedEnv = loadLinkedEnvFile(workplaceSubdomain)
    const envCount = Object.keys(linkedEnv).length
    if (envCount > 0) {
      console.log(`\nLoading env from .skedyul/env/${workplaceSubdomain}.env`)
      console.log(`  ✓ Loaded ${envCount} environment variables`)
      Object.assign(process.env, linkedEnv)
    }
  }

  // Load registry
  let registry
  try {
    registry = await loadRegistry(registryPath)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const toolCount = Object.keys(registry).length
  console.log(`\nLoaded ${toolCount} tool(s) from registry`)

  // Create server
  const server = createSkedyulServer(
    {
      computeLayer: 'dedicated',
      metadata: {
        name: serverName,
        version: serverVersion,
      },
      defaultPort: port,
    },
    registry,
  )

  // Start listening
  const dedicatedServer = server as DedicatedServerInstance

  try {
    await dedicatedServer.listen(port)
    console.log(`\n✓ Server listening on http://localhost:${port}`)
  } catch (error) {
    console.error('Failed to start server:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  // Sidecar mode: start tunnel and register endpoint
  if (isLinked && linkConfig && credentials) {
    const noTunnel = flags['no-tunnel'] === true
    const tunnelUrl = flags['tunnel-url'] as string | undefined

    let invokeEndpoint: string

    if (tunnelUrl) {
      // Use provided tunnel URL
      invokeEndpoint = tunnelUrl
      console.log(`\nUsing tunnel URL: ${invokeEndpoint}`)
    } else if (noTunnel) {
      // No tunnel mode - use localhost (for testing)
      invokeEndpoint = `http://localhost:${port}`
      console.log(`\nNo tunnel mode - using localhost`)
      console.log(`  Warning: Skedyul server won't be able to reach this endpoint`)
    } else {
      // Start ngrok tunnel
      const ngrokAvailable = await isNgrokAvailable()
      if (!ngrokAvailable) {
        console.error('\nError: ngrok is required for tunneling.')
        console.error('Install it with: pnpm add -D @ngrok/ngrok')
        console.error('Or use --tunnel-url with an existing tunnel.')
        process.exit(1)
      }

      console.log(`\nStarting ngrok tunnel...`)
      try {
        tunnel = await startTunnel({ port })
        invokeEndpoint = tunnel.url
        console.log(`  ✓ Tunnel active: ${invokeEndpoint}`)
      } catch (error) {
        console.error(`Failed to start tunnel: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    }

    // Register endpoint with Skedyul
    console.log(`\nRegistering endpoint with Skedyul...`)
    try {
      await callCliApi(
        { serverUrl: linkConfig.serverUrl, token: credentials.token },
        '/register-endpoint',
        {
          appVersionId: linkConfig.appVersionId,
          invokeEndpoint,
        },
      )
      console.log(`  ✓ Registered as invokeEndpoint for ${linkConfig.appVersionHandle}`)
    } catch (error) {
      console.error(`Failed to register endpoint: ${error instanceof Error ? error.message : String(error)}`)
      // Continue anyway, might be a temporary issue
    }

    // Start heartbeat
    const sendHeartbeat = async () => {
      try {
        await callCliApi(
          { serverUrl: linkConfig!.serverUrl, token: credentials!.token },
          '/heartbeat',
          { appVersionId: linkConfig!.appVersionId },
        )
        const timestamp = new Date().toLocaleTimeString()
        console.log(`[${timestamp}] Heartbeat sent ✓`)
      } catch (error) {
        const timestamp = new Date().toLocaleTimeString()
        console.error(`[${timestamp}] Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)

    // Print ready message
    console.log(`\n${'━'.repeat(50)}`)
    console.log(`Ready to receive tool calls from Skedyul!`)
    console.log(`Workplace: ${workplaceSubdomain}`)
    console.log(`Endpoint: ${invokeEndpoint}`)
    console.log(`Press Ctrl+C to stop`)
    console.log('━'.repeat(50))

    // Handle graceful shutdown
    const cleanup = async () => {
      console.log('\n\nShutting down...')

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }

      // Unregister endpoint
      try {
        await callCliApi(
          { serverUrl: linkConfig!.serverUrl, token: credentials!.token },
          '/unregister-endpoint',
          { appVersionId: linkConfig!.appVersionId },
        )
        console.log('  ✓ Unregistered endpoint')
      } catch {
        // Ignore errors on shutdown
      }

      // Close tunnel
      if (tunnel) {
        try {
          await tunnel.disconnect()
          console.log('  ✓ Tunnel closed')
        } catch {
          // Ignore errors on shutdown
        }
      }

      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  } else {
    // Standalone mode
    console.log(`\nEndpoints:`)
    console.log(`  POST http://localhost:${port}/mcp      - MCP JSON-RPC`)
    console.log(`  GET  http://localhost:${port}/health   - Health check`)
    console.log(`  POST http://localhost:${port}/estimate - Billing estimate`)
    console.log(`\nPress Ctrl+C to stop`)
  }
}

