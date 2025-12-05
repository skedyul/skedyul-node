import { parseArgs, parseEnvFlags, loadEnvFile, loadRegistry } from '../utils'
import { createSkedyulServer } from '../../server'
import type { DedicatedServerInstance } from '../../types'

function printHelp(): void {
  console.log(`
skedyul dev serve - Start a local MCP server for testing

Usage:
  skedyul dev serve [options]

Options:
  --registry, -r      Path to the registry file (default: ./dist/registry.js)
  --port, -p          Port to listen on (default: 3000)
  --name              Server name for MCP metadata (default: 'Local Dev Server')
  --version           Server version for MCP metadata (default: '0.0.1')
  --env, -e           Set environment variable (can be used multiple times)
                      Format: --env KEY=VALUE
  --env-file          Load environment variables from a file
  --help, -h          Show this help message

Examples:
  # Start server on default port
  skedyul dev serve --registry ./dist/registry.js

  # Start on custom port
  skedyul dev serve --registry ./dist/registry.js --port 3001

  # With environment variables
  skedyul dev serve \\
    --registry ./dist/registry.js \\
    --env API_KEY=secret123 \\
    --env-file .env.local

Endpoints:
  POST /mcp            MCP JSON-RPC endpoint (tools/list, tools/call)
  GET  /health         Health check endpoint
  POST /estimate       Estimate billing for a tool call
  POST /core           Core API methods (if configured)

Testing with curl:
  # List tools
  curl -X POST http://localhost:3000/mcp \\
    -H 'Content-Type: application/json' \\
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

  # Call a tool
  curl -X POST http://localhost:3000/mcp \\
    -H 'Content-Type: application/json' \\
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"my_tool","arguments":{"key":"value"}}}'
`)
}

export async function serveCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  // Get registry path
  const registryPath = (flags.registry || flags.r || './dist/registry.js') as string

  // Get port
  let port = 3000
  const portFlag = flags.port || flags.p
  if (portFlag && typeof portFlag === 'string') {
    const parsed = parseInt(portFlag, 10)
    if (!isNaN(parsed)) {
      port = parsed
    }
  }

  // Get server metadata
  const serverName = (flags.name || 'Local Dev Server') as string
  const serverVersion = (flags.version || '0.0.1') as string

  // Build environment
  const envFile = flags['env-file']
  if (envFile && typeof envFile === 'string') {
    try {
      const fileEnv = loadEnvFile(envFile)
      Object.assign(process.env, fileEnv)
    } catch (error) {
      console.error(`Error loading env file: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  // Parse --env flags from raw args
  const cliEnv = parseEnvFlags(args)
  Object.assign(process.env, cliEnv)

  // Load registry
  let registry
  try {
    registry = await loadRegistry(registryPath)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const toolCount = Object.keys(registry).length
  console.log(`Loaded ${toolCount} tool(s) from registry`)

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
    console.log(`\nEndpoints:`)
    console.log(`  POST http://localhost:${port}/mcp      - MCP JSON-RPC`)
    console.log(`  GET  http://localhost:${port}/health   - Health check`)
    console.log(`  POST http://localhost:${port}/estimate - Billing estimate`)
    console.log(`\nPress Ctrl+C to stop`)
  } catch (error) {
    console.error('Failed to start server:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

