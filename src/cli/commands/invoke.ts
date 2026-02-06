import * as z from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import {
  parseArgs,
  parseEnvFlags,
  loadEnvFile as loadEnvFileFromPath,
  loadRegistry,
  formatJson,
} from '../utils'
import type {
  ToolRegistryEntry,
  ToolExecutionContext,
  AgentToolContext,
  ToolExecutionResult,
} from '../../types'
import { getCredentials, callCliApi } from '../utils/auth'
import { getLinkConfig, loadEnvFile as loadLinkedEnvFile } from '../utils/link'
import { findRegistryPath } from '../utils/config'

/**
 * Find available linked workplaces from .skedyul/links/
 */
function getLinkedWorkplaces(): string[] {
  const linksDir = path.join(process.cwd(), '.skedyul', 'links')
  if (!fs.existsSync(linksDir)) {
    return []
  }
  
  try {
    const files = fs.readdirSync(linksDir)
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

function printHelp(): void {
  console.log(`
skedyul dev invoke - Invoke a tool from the registry

Usage:
  skedyul dev invoke <tool-name> [options]

Arguments:
  <tool-name>         Name of the tool to invoke (e.g., 'calendar_slots.list')

Options:
  --registry, -r      Path to the registry file (default: auto-detected)
  --args, -a          JSON string of arguments to pass to the tool
  --env, -e           Set environment variable (can be used multiple times)
                      Format: --env KEY=VALUE
  --env-file          Load environment variables from a file (e.g., .env.local)
  --estimate          Run in estimate mode (billing only, no execution)
  --help, -h          Show this help message

Workplace Options:
  --workplace, -w     Workplace subdomain (auto-detected if only one is linked)
                      Loads env vars from .skedyul/env/{workplace}.env

Examples:
  # Basic invocation (auto-detects workspace if only one is linked)
  skedyul dev invoke appointment_types_list

  # Specify workplace explicitly
  skedyul dev invoke appointment_types_list --workplace crux

  # With arguments
  skedyul dev invoke create_booking --args '{"date": "2024-01-15"}'

  # With inline environment variables
  skedyul dev invoke api_call \\
    --args '{"endpoint": "/users"}' \\
    --env API_KEY=secret123

  # Estimate mode (billing only)
  skedyul dev invoke expensive_tool --estimate
`)
}

function getZodSchema(schema: unknown): z.ZodTypeAny | undefined {
  if (!schema) return undefined
  if (schema instanceof z.ZodType) {
    return schema
  }
  if (typeof schema === 'object' && schema !== null && 'zod' in schema) {
    const schemaWithZod = schema as { zod?: unknown }
    if (schemaWithZod.zod instanceof z.ZodType) {
      return schemaWithZod.zod
    }
  }
  return undefined
}

interface TokenResponse {
  token: string
  expiresAt: string
}

export async function invokeCommand(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const toolName = positional[0]

  if (!toolName) {
    console.error('Error: Tool name is required')
    console.error("Run 'skedyul dev invoke --help' for usage information.")
    process.exit(1)
  }

  let workplaceSubdomain = (flags.workplace || flags.w) as string | undefined
  
  // Auto-detect workplace if not specified and there's only one linked
  if (!workplaceSubdomain) {
    const linkedWorkplaces = getLinkedWorkplaces()
    if (linkedWorkplaces.length === 1) {
      workplaceSubdomain = linkedWorkplaces[0]
      console.error(`Auto-detected workplace: ${workplaceSubdomain}`)
    } else if (linkedWorkplaces.length > 1) {
      console.error('Error: Multiple workplaces linked. Please specify one with --workplace:')
      for (const wp of linkedWorkplaces) {
        console.error(`  - ${wp}`)
      }
      console.error(`\nExample: skedyul dev invoke ${toolName} --workplace ${linkedWorkplaces[0]}`)
      process.exit(1)
    }
  }
  
  // If workplace is specified, automatically enable linked mode
  const isLinked = workplaceSubdomain !== undefined

  // Get registry path
  // Get registry path - auto-detect if not specified
  let registryPath = (flags.registry || flags.r) as string | undefined
  if (!registryPath) {
    registryPath = findRegistryPath() ?? './dist/registry.js'
  }

  // Parse tool arguments
  let toolArgs: Record<string, unknown> = {}
  const argsValue = flags.args || flags.a
  if (argsValue && typeof argsValue === 'string') {
    try {
      toolArgs = JSON.parse(argsValue)
    } catch {
      console.error('Error: Invalid JSON in --args')
      process.exit(1)
    }
  }

  // Build environment
  const env: Record<string, string> = { ...process.env as Record<string, string> }

  // Load from env file if specified
  const envFilePath = flags['env-file']
  if (envFilePath && typeof envFilePath === 'string') {
    try {
      const fileEnv = loadEnvFileFromPath(envFilePath)
      Object.assign(env, fileEnv)
    } catch (error) {
      console.error(`Error loading env file: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  // Parse --env flags from raw args
  const cliEnv = parseEnvFlags(args)
  Object.assign(env, cliEnv)

  // Linked mode: load additional env and get API token
  let linkConfig: ReturnType<typeof getLinkConfig> = null
  let workplaceToken: string | null = null

  if (isLinked && workplaceSubdomain) {
    // Check authentication
    const credentials = getCredentials()
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

    // Load env vars for this workplace
    const linkedEnv = loadLinkedEnvFile(workplaceSubdomain)
    Object.assign(env, linkedEnv)

    // Get a fresh workplace token
    console.error(`Getting API token for ${workplaceSubdomain}...`)
    try {
      const tokenResponse = await callCliApi<TokenResponse>(
        { serverUrl: linkConfig.serverUrl, token: credentials.token },
        '/token',
        { appInstallationId: linkConfig.appInstallationId },
      )
      workplaceToken = tokenResponse.token
      env.SKEDYUL_API_TOKEN = workplaceToken
    } catch (error) {
      console.error(`Failed to get API token: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  // Check for estimate mode
  const estimateMode = Boolean(flags.estimate)

  // Load registry
  let registry
  try {
    registry = await loadRegistry(registryPath)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  // Find tool
  let tool: ToolRegistryEntry | undefined

  // Try exact match first
  if (registry[toolName]) {
    tool = registry[toolName]
  } else {
    // Search by tool.name property
    for (const [, entry] of Object.entries(registry)) {
      if (entry.name === toolName) {
        tool = entry
        break
      }
    }
  }

  if (!tool) {
    console.error(`Error: Tool "${toolName}" not found in registry`)
    console.error('\nAvailable tools:')
    for (const [key, entry] of Object.entries(registry)) {
      console.error(`  - ${entry.name || key}`)
    }
    process.exit(1)
  }

  // Validate inputs if schema exists
  const inputSchema = getZodSchema(tool.inputSchema)
  let validatedArgs: Record<string, unknown> = toolArgs

  if (inputSchema) {
    try {
      validatedArgs = inputSchema.parse(toolArgs) as Record<string, unknown>
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Error: Invalid tool arguments')
        for (const issue of error.issues) {
          console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
        }
        process.exit(1)
      }
      throw error
    }
  }

  // Create context based on mode
  let context: AgentToolContext

  if (isLinked && linkConfig) {
    // Linked mode: use real context
    context = {
      trigger: 'agent',
      app: { id: linkConfig.appId, versionId: linkConfig.appVersionId },
      appInstallationId: linkConfig.appInstallationId,
      workplace: { id: linkConfig.workplaceId, subdomain: linkConfig.workplaceSubdomain },
      request: { url: 'cli://invoke', params: {}, query: {} },
      env,
      mode: estimateMode ? 'estimate' : 'execute',
    }
  } else {
    // Standalone mode: use minimal context
    context = {
      trigger: 'agent',
      app: { id: 'cli', versionId: 'local' },
      appInstallationId: 'cli-local',
      workplace: { id: 'cli', subdomain: 'local' },
      request: { url: 'cli://invoke', params: {}, query: {} },
      env,
      mode: estimateMode ? 'estimate' : 'execute',
    }
  }

  // Execute tool
  console.error(`Invoking tool: ${tool.name}`)
  if (isLinked && workplaceSubdomain) {
    console.error(`Workplace: ${workplaceSubdomain}`)
  }
  if (estimateMode) {
    console.error('Mode: estimate (billing only)')
  }

  try {
    const handler = tool.handler as (
      input: unknown,
      context: ToolExecutionContext,
    ) => Promise<ToolExecutionResult<unknown>>

    const result = await handler(validatedArgs, context)

    // Output result
    if (estimateMode) {
      console.log(formatJson({ billing: result.billing }))
    } else {
      console.log(formatJson({
        output: result.output,
        billing: result.billing,
        meta: result.meta,
      }))
    }
  } catch (error) {
    console.error('Error executing tool:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

