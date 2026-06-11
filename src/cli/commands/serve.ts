import * as fs from 'fs'
import * as path from 'path'
import {
  parseArgs,
  parseEnvFlags,
  loadEnvFile as loadEnvFileFromPath,
  loadRegistry,
  loadWebhookRegistry,
} from '../utils'
import { createSkedyulServer } from '../../server'
import type { DedicatedServerInstance, ToolRegistry } from '../../types'
import { getCredentials, callCliApi, getNgrokAuthtoken, setNgrokAuthtoken, getServerUrl } from '../utils/auth'
import { getLinkConfig, saveLinkConfig, ensureSkedyulDirs, type LinkConfig } from '../utils/link'
import { findRegistryPath, loadInstallConfig, loadInstallHandler, loadAppConfig, buildExecutableSyncConfig, filterEnvForInstallWorkflow } from '../utils/config'
import {
  applyEnvToProcess,
  buildInstallScopedEnvFields,
  buildProvisionEnvFields,
  fetchEnvFromPlatform,
  pruneProvisionKeysFromLocalEnv,
  syncProvisionEnvToPlatform,
} from '../utils/env-sync'
import { syncResourcesWithMigrationApproval } from '../utils/migration-approval'
import { startTunnel, isNgrokAvailable } from '../utils/tunnel'
import type { TunnelConnection } from '../utils/tunnel'
import * as readline from 'readline'
import * as z from 'zod'
import type { InstallHandler } from '../../types'

const SERVE_STATE_FILE = '.skedyul/serve.json'

interface ServeState {
  port: number
  workplace?: string
  startedAt: string
}

function writeServeState(port: number, workplace?: string): void {
  try {
    ensureSkedyulDirs()
    const state: ServeState = {
      port,
      workplace,
      startedAt: new Date().toISOString(),
    }
    const statePath = path.join(process.cwd(), SERVE_STATE_FILE)
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
  } catch {
    // Ignore errors writing state file
  }
}

function removeServeState(): void {
  try {
    const statePath = path.join(process.cwd(), SERVE_STATE_FILE)
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath)
    }
  } catch {
    // Ignore errors removing state file
  }
}

async function provisionAppVersionResources(
  linkConfig: LinkConfig,
  token: string,
  config: Record<string, unknown>,
): Promise<void> {
  console.log(`\nProvisioning app resources (tools, webhooks, models, workflows, agents)...`)
  const result = await syncResourcesWithMigrationApproval(
    linkConfig,
    token,
    config,
  )
  const toolsSynced = result.tools?.synced ?? 0
  const webhooksSynced = result.webhooks?.synced ?? 0
  console.log(`  ✓ Provisioned ${toolsSynced} tool(s), ${webhooksSynced} webhook handler(s)`)
}

/**
 * Prompt the user for input
 */
async function promptInput(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    if (hidden) {
      // For hidden input, don't echo characters
      process.stdout.write(question)
      let input = ''
      
      const stdin = process.stdin
      const wasRaw = stdin.isRaw
      if (stdin.setRawMode) stdin.setRawMode(true)
      stdin.resume()
      stdin.setEncoding('utf8')
      
      const onData = (char: string) => {
        if (char === '\n' || char === '\r') {
          stdin.removeListener('data', onData)
          if (stdin.setRawMode) stdin.setRawMode(wasRaw ?? false)
          process.stdout.write('\n')
          rl.close()
          resolve(input)
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(0)
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1)
          }
        } else {
          input += char
        }
      }
      
      stdin.on('data', onData)
    } else {
      rl.question(question, (answer) => {
        rl.close()
        resolve(answer.trim())
      })
    }
  })
}

interface InstallationStatusResponse {
  status: string
  appInstallationId: string
}

function hasRequiredInstallEnvInDb(
  env: Record<string, string>,
  installFields: Array<{ key: string; field: { required?: boolean } }>,
): boolean {
  if (installFields.length === 0) {
    return true
  }

  return installFields.every(({ key, field }) => {
    if (!field.required) return true
    return Boolean(env[key]?.trim())
  })
}

/**
 * Determine whether the install workflow should run after the server is up.
 * Requires install-scoped env in DB (via dev install) when defined.
 */
async function shouldRunInstallWorkflow(
  linkConfig: LinkConfig,
  credentials: NonNullable<ReturnType<typeof getCredentials>>,
): Promise<boolean> {
  const installFields = await buildInstallScopedEnvFields()

  if (installFields.length > 0) {
    const installEnv = await fetchEnvFromPlatform(
      linkConfig,
      credentials.token,
      'install',
    )

    if (!hasRequiredInstallEnvInDb(installEnv, installFields)) {
      console.log(
        `\n⚠ Missing install environment variables. Run 'skedyul dev install --workplace ${linkConfig.workplaceSubdomain}' first.`,
      )
      return false
    }
  }

  try {
    const result = await callCliApi<InstallationStatusResponse>(
      { serverUrl: linkConfig.serverUrl, token: credentials.token },
      '/installation',
      { appVersionId: linkConfig.appVersionId },
    )
    return result.status !== 'INSTALLED'
  } catch {
    return false
  }
}

/**
 * Load provision-scoped env from Skedyul DB, prompt for missing required vars,
 * sync back to DB, and apply to process.env.
 */
async function ensureProvisionEnvFromDb(
  linkConfig: LinkConfig,
  credentials: NonNullable<ReturnType<typeof getCredentials>>,
): Promise<Record<string, string>> {
  const provisionFields = await buildProvisionEnvFields()
  if (provisionFields.length === 0) {
    return {}
  }

  console.log('\nLoading provision env from Skedyul...')
  let env = await fetchEnvFromPlatform(linkConfig, credentials.token, 'provision')

  const missingRequired = provisionFields.filter(
    ({ key, field }) => field.required && !env[key]?.trim(),
  )

  if (missingRequired.length > 0) {
    console.log(`\n⚠ Missing required provision environment variables:`)
    console.log('─'.repeat(50))

    for (const { key, field } of missingRequired) {
      const isSecret = field.visibility === 'encrypted'

      console.log(`\n${field.label || key}`)
      if (field.description) {
        console.log(`  ${field.description}`)
      }
      if (field.placeholder) {
        console.log(`  Example: ${field.placeholder}`)
      }

      const value = await promptInput(`  Enter ${key}: `, isSecret)

      if (!value && field.required) {
        console.error(`\nError: ${key} is required.`)
        process.exit(1)
      }

      if (value) {
        env[key] = value
      }
    }

    await syncProvisionEnvToPlatform(
      linkConfig,
      credentials.token,
      env,
      provisionFields,
    )
    console.log('  ✓ Saved provision variables to Skedyul')
  }

  applyEnvToProcess(env)
  const envCount = Object.keys(env).length
  if (envCount > 0) {
    console.log(`  ✓ Loaded ${envCount} provision variable(s)`)
  }

  return env
}

async function refreshProvisionEnvFromDb(
  linkConfig: LinkConfig,
  token: string,
): Promise<void> {
  const env = await fetchEnvFromPlatform(linkConfig, token, 'provision')
  applyEnvToProcess(env)
}

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
  --workplace, -w     Workplace subdomain (enables sidecar mode automatically)
  --no-tunnel         Don't start ngrok tunnel (use with external tunnel)
  --tunnel-url        Use existing tunnel URL instead of starting new one

Examples:
  # Standalone mode
  skedyul dev serve --registry ./dist/registry.js

  # Sidecar mode with ngrok tunnel
  skedyul dev serve --workplace demo-clinic

  # Sidecar mode with existing tunnel
  skedyul dev serve --workplace demo-clinic \\
    --tunnel-url https://abc123.ngrok.io

Endpoints:
  POST /mcp            MCP JSON-RPC endpoint (tools/list, tools/call)
  GET  /health         Health check endpoint
  POST /estimate       Estimate billing for a tool call
  POST /core           Core API methods (if configured)
`)
}

import * as net from 'net'

/**
 * Convert a Zod schema to a JSON Schema representation for serialization.
 * Raw Zod instances contain internal properties (functions, symbols) that
 * can't be stored in the database, so we convert them first.
 */
function safeInputSchemaToJson(schema: unknown): unknown {
  if (!schema) return undefined

  // Check if it's a Zod schema (has _def property or is ZodType instance)
  if (schema instanceof z.ZodType) {
    try {
      return z.toJSONSchema(schema, { unrepresentable: 'any' })
    } catch {
      return undefined
    }
  }

  // Already a plain object (JSON Schema), return as-is
  if (typeof schema === 'object') {
    return schema
  }

  return undefined
}

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

  const workplaceSubdomain = (flags.workplace || flags.w) as string | undefined
  
  // If --workplace is provided, automatically enable linked mode
  const isLinked = flags.linked === true || !!workplaceSubdomain

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
  let runInstallWorkflow = false

  if (isLinked && workplaceSubdomain) {
    // Check authentication
    credentials = getCredentials()
    if (!credentials) {
      console.error('Error: Not logged in.')
      console.error("Run 'skedyul auth login' to authenticate first.")
      process.exit(1)
    }

    // Check link config - auto-link if not linked
    linkConfig = getLinkConfig(workplaceSubdomain)
    if (!linkConfig) {
      console.log(`Not linked to ${workplaceSubdomain}, linking now...`)
      
      // Load app config to get handle
      const appConfig = await loadAppConfig()
      if (!appConfig) {
        console.error('Error: No skedyul.config.ts found in current directory.')
        console.error('Make sure you are in a Skedyul app directory.')
        process.exit(1)
      }

      console.log(`  App: ${appConfig.handle}`)
      
      // Get server URL
      const serverUrl = getServerUrl()
      
      try {
        interface LinkResponse {
          appId: string
          appHandle: string
          appVersionId: string
          appVersionHandle: string
          appInstallationId: string
          workplaceId: string
          workplaceSubdomain: string
          isNewVersion: boolean
          isNewInstallation: boolean
        }

        const response = await callCliApi<LinkResponse>(
          { serverUrl, token: credentials.token },
          '/link',
          {
            appHandle: appConfig.handle,
            workplaceSubdomain,
          },
        )

        // Save link config
        linkConfig = {
          appId: response.appId,
          appHandle: response.appHandle,
          appVersionId: response.appVersionId,
          appVersionHandle: response.appVersionHandle,
          appInstallationId: response.appInstallationId,
          workplaceId: response.workplaceId,
          workplaceSubdomain: response.workplaceSubdomain,
          createdAt: new Date().toISOString(),
          serverUrl,
        }

        saveLinkConfig(linkConfig)

        if (response.isNewVersion) {
          console.log(`  ✓ Created AppVersion: ${response.appVersionHandle}`)
        } else {
          console.log(`  ✓ Using AppVersion: ${response.appVersionHandle}`)
        }

        if (response.isNewInstallation) {
          console.log(`  ✓ Created AppInstallation`)
        } else {
          console.log(`  ✓ Using AppInstallation`)
        }

        console.log(`  ✓ Link saved to .skedyul/links/${workplaceSubdomain}.json`)
      } catch (error) {
        console.error(`Failed to link: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    } else {
      console.log(`Loading link from .skedyul/links/${workplaceSubdomain}.json`)
    }

    console.log(`  App: ${linkConfig.appHandle}`)
    console.log(`  Workplace: ${linkConfig.workplaceSubdomain}`)
    console.log(`  AppVersion: ${linkConfig.appVersionHandle}`)

    runInstallWorkflow = await shouldRunInstallWorkflow(linkConfig, credentials)

    // Core API callbacks from tools should hit the Skedyul web app, not the MCP tunnel
    process.env.SKEDYUL_API_URL = linkConfig.serverUrl
  }

  // Load registry
  let registry: ToolRegistry
  let webhookRegistry = {}
  try {
    registry = await loadRegistry(registryPath)
    webhookRegistry = await loadWebhookRegistry(registryPath)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const toolCount = Object.keys(registry).length
  const webhookCount = Object.keys(webhookRegistry).length
  console.log(`\nLoaded ${toolCount} tool(s) from registry`)
  if (webhookCount > 0) {
    console.log(`Loaded ${webhookCount} webhook(s) from registry`)
  }

  // Build config object to sync with Skedyul (includes provision.env for Developer Console)
  let executableConfig: Record<string, unknown> | undefined
  if (isLinked && linkConfig && credentials) {
    executableConfig = await buildExecutableSyncConfig(
      registry,
      safeInputSchemaToJson,
      undefined,
      webhookRegistry,
    )

    const provision = executableConfig.provision as { env?: Record<string, unknown>; models?: unknown[]; pages?: unknown[] } | undefined

    console.log(`\nBuilt config for sync:`)
    console.log(`  Name: ${executableConfig.name ?? '(not found)'}`)
    console.log(`  Handle: ${executableConfig.handle ?? '(not found)'}`)
    console.log(`  Tools: ${Object.keys(registry).length}`)
    console.log(`  Webhooks: ${webhookCount}`)
    console.log(`  Provision env: ${Object.keys(provision?.env ?? {}).length} variables`)
    console.log(`  Provision models: ${provision?.models?.length ?? 0}`)
    console.log(`  Provision pages: ${provision?.pages?.length ?? 0}`)

    // Load provision env from DB before reprovision (prompt if missing)
    await ensureProvisionEnvFromDb(linkConfig, credentials)
    process.env.SKEDYUL_API_URL = linkConfig.serverUrl

    try {
      await provisionAppVersionResources(
        linkConfig,
        credentials.token,
        executableConfig,
      )
    } catch (error) {
      console.error(
        `Failed to provision app resources: ${error instanceof Error ? error.message : String(error)}`,
      )
      process.exit(1)
    }
  }

  // Load install handler if available
  let installHandler: InstallHandler | undefined
  try {
    const handler = await loadInstallHandler()
    if (handler) {
      installHandler = handler as InstallHandler
      console.log(`\n✓ Loaded install handler`)
    }
  } catch (error) {
    console.warn(`Could not load install handler: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Create server
  const server = createSkedyulServer({
    name: serverName,
    version: serverVersion,
    computeLayer: 'dedicated',
    defaultPort: port,
    tools: registry,
    hooks: installHandler ? { install: installHandler } : undefined,
  })

  // Start listening
  const dedicatedServer = server as DedicatedServerInstance

  try {
    await dedicatedServer.listen(port)
    console.log(`\n✓ Server listening on http://localhost:${port}`)
    writeServeState(port, workplaceSubdomain)
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

      // Check for ngrok authtoken, prompt if missing
      let authToken = getNgrokAuthtoken()
      if (!authToken) {
        console.log(`\n⚠ ngrok authtoken not configured.`)
        console.log(`  Get a free authtoken at: https://dashboard.ngrok.com/get-started/your-authtoken`)
        console.log('')
        authToken = await promptInput('Enter your ngrok authtoken: ')
        
        if (!authToken) {
          console.error('Error: ngrok authtoken is required for tunneling.')
          console.error('Or use --tunnel-url with an existing tunnel.')
          process.exit(1)
        }

        // Save for future use
        setNgrokAuthtoken(authToken)
        console.log(`  ✓ Authtoken saved to ~/.skedyul/config.json`)
      }

      console.log(`\nStarting ngrok tunnel...`)
      try {
        tunnel = await startTunnel({ port, authToken })
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
      const registerUrl = `${linkConfig.serverUrl}/api/cli/register-endpoint`
      const registerBody = {
          appVersionId: linkConfig.appVersionId,
          invokeEndpoint,
          config: executableConfig,
      }

      const registerResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.token}`,
        },
        body: JSON.stringify(registerBody),
      })

      if (!registerResponse.ok) {
        const responseText = await registerResponse.text()
        console.error(`Failed to register endpoint (HTTP ${registerResponse.status}):`)
        // Show first 500 chars of response body for debugging
        console.error(`  Response: ${responseText.substring(0, 500)}`)
      } else {
      console.log(`  ✓ Registered as invokeEndpoint for ${linkConfig.appVersionHandle}`)
      console.log(`  ✓ Synced ${toolCount} tools to Skedyul`)
      }
    } catch (error) {
      console.error(`Failed to register endpoint: ${error instanceof Error ? error.message : String(error)}`)
      // Continue anyway, might be a temporary issue
    }

    // Run deferred install workflow now that the server is up and endpoint is registered.
    // The Temporal workflow calls the app's /install handler via HTTP, so the server
    // must be reachable first.
    if (runInstallWorkflow) {
      console.log(`\nRunning installation workflow...`)
      try {
        const installConfig = await loadInstallConfig()
        const installEnvFromDb = await fetchEnvFromPlatform(
          linkConfig,
          credentials.token,
          'install',
        )
        const installEnv = filterEnvForInstallWorkflow(installEnvFromDb, installConfig)

        await callCliApi(
          { serverUrl: linkConfig.serverUrl, token: credentials.token },
          '/install',
          {
            appVersionId: linkConfig.appVersionId,
            env: installEnv,
          },
        )
        console.log(`  ✓ Installation completed`)
      } catch (error) {
        console.error(`  ⚠ Installation workflow failed: ${error instanceof Error ? error.message : String(error)}`)
        console.error(`  (You can continue with local testing, but some features may not work)`)
      }
    }

    // Start heartbeat (also syncs config on each heartbeat for hot-reload)
    const sendHeartbeat = async () => {
      try {
        await refreshProvisionEnvFromDb(linkConfig!, credentials!.token)
        process.env.SKEDYUL_API_URL = linkConfig!.serverUrl

        const freshConfig = await buildExecutableSyncConfig(
          registry,
          safeInputSchemaToJson,
          undefined,
          webhookRegistry,
        )

        await callCliApi(
          { serverUrl: linkConfig!.serverUrl, token: credentials!.token },
          '/heartbeat',
          { 
            appVersionId: linkConfig!.appVersionId,
            config: freshConfig,
          },
        )
        const timestamp = new Date().toLocaleTimeString()
        console.log(`[${timestamp}] Heartbeat sent ✓`)
      } catch (error) {
        const timestamp = new Date().toLocaleTimeString()
        console.error(`[${timestamp}] Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)

    // Build install page URL
    const installPageUrl = `${linkConfig.serverUrl}/${workplaceSubdomain}/settings/apps/${linkConfig.appHandle}/install/${linkConfig.appInstallationId}`

    // Print ready message
    console.log(`\n${'━'.repeat(60)}`)
    console.log(`✓ Ready to receive tool calls from Skedyul!`)
    console.log(``)
    console.log(`  Workplace:    ${workplaceSubdomain}`)
    console.log(`  App:          ${linkConfig.appHandle}`)
    console.log(`  Endpoint:     ${invokeEndpoint}`)
    console.log(`  Install page: ${installPageUrl}`)
    console.log(``)
    console.log(`  Ctrl+C        Stop server (keep installation)`)
    console.log(`  Ctrl+Q        Stop and unlink from workplace`)
    console.log('━'.repeat(60))

    // Cleanup function - stop server but keep installation
    const stopServer = async () => {
      console.log('\n\nStopping server...')

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }

      // Unregister endpoint (mark as offline, but keep installation)
      try {
        await callCliApi(
          { serverUrl: linkConfig!.serverUrl, token: credentials!.token },
          '/unregister-endpoint',
          { appVersionId: linkConfig!.appVersionId },
        )
        console.log('  ✓ Endpoint unregistered (installation preserved)')
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

      removeServeState()
      console.log(`\nTo restart: skedyul dev serve --workplace ${workplaceSubdomain}`)
      process.exit(0)
    }

    // Cleanup function - stop and unlink completely (runs uninstall workflow)
    const stopAndUnlink = async () => {
      console.log('\n\nStopping and unlinking...')

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
        console.log('  ✓ Endpoint unregistered')
      } catch {
        // Ignore errors on shutdown
      }

      // Run uninstall workflow to clean up server-side resources
      try {
        console.log('  Running uninstall workflow...')
        await callCliApi(
          { serverUrl: linkConfig!.serverUrl, token: credentials!.token },
          '/uninstall',
          { 
            appInstallationId: linkConfig!.appInstallationId,
            deleteFields: false, // Preserve custom fields for re-install
          },
        )
        console.log('  ✓ Uninstall workflow started')
      } catch (error) {
        console.warn(`  ⚠ Uninstall workflow failed: ${error instanceof Error ? error.message : String(error)}`)
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

      // Delete local link config
      try {
        const { deleteLinkConfig, deleteEnvFile } = await import('../utils/link')
        deleteLinkConfig(workplaceSubdomain!)
        deleteEnvFile(workplaceSubdomain!)
        console.log('  ✓ Local link removed')
      } catch {
        // Ignore errors
      }

      removeServeState()
      console.log(`\nTo re-link: skedyul dev link --workplace ${workplaceSubdomain}`)
      process.exit(0)
    }

    // Handle Ctrl+C (SIGINT) - stop but keep install
    process.on('SIGINT', stopServer)
    
    // Handle SIGTERM - stop but keep install
    process.on('SIGTERM', stopServer)

    // Handle Ctrl+Q via raw keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')
      
      process.stdin.on('data', (key: string) => {
        // Ctrl+Q = \x11
        if (key === '\x11') {
          stopAndUnlink()
        }
        // Ctrl+C = \x03 (backup handler)
        if (key === '\x03') {
          stopServer()
        }
      })
    }
  } else {
    // Standalone mode
    console.log(`\nEndpoints:`)
    console.log(`  POST http://localhost:${port}/mcp      - MCP JSON-RPC`)
    console.log(`  GET  http://localhost:${port}/health   - Health check`)
    console.log(`  POST http://localhost:${port}/estimate - Billing estimate`)
    console.log(`\nPress Ctrl+C to stop`)

    // Handle cleanup in standalone mode
    const standaloneCleanup = () => {
      console.log('\n\nStopping server...')
      removeServeState()
      process.exit(0)
    }

    process.on('SIGINT', standaloneCleanup)
    process.on('SIGTERM', standaloneCleanup)
  }
}

