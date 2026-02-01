import * as z from 'zod'
import {
  parseArgs,
  parseEnvFlags,
  loadEnvFile,
  loadRegistry,
  formatJson,
} from '../utils'
import type { ToolRegistryEntry, ToolExecutionContext, AgentToolContext } from '../../types'

function printHelp(): void {
  console.log(`
skedyul dev invoke - Invoke a tool from the registry

Usage:
  skedyul dev invoke <tool-name> [options]

Arguments:
  <tool-name>         Name of the tool to invoke (e.g., 'calendar_slots.list')

Options:
  --registry, -r      Path to the registry file (default: ./dist/registry.js)
  --args, -a          JSON string of arguments to pass to the tool
  --env, -e           Set environment variable (can be used multiple times)
                      Format: --env KEY=VALUE
  --env-file          Load environment variables from a file (e.g., .env.local)
  --estimate          Run in estimate mode (billing only, no execution)
  --help, -h          Show this help message

Examples:
  # Basic invocation
  skedyul dev invoke my_tool --registry ./dist/registry.js --args '{"key": "value"}'

  # With environment variables
  skedyul dev invoke api_call \\
    --registry ./dist/registry.js \\
    --args '{"endpoint": "/users"}' \\
    --env API_KEY=secret123 \\
    --env BASE_URL=https://api.example.com

  # Load env from file
  skedyul dev invoke api_call \\
    --registry ./dist/registry.js \\
    --args '{"endpoint": "/users"}' \\
    --env-file .env.local

  # Estimate mode (billing only)
  skedyul dev invoke expensive_tool \\
    --registry ./dist/registry.js \\
    --args '{"data": "test"}' \\
    --estimate
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

  // Get registry path
  const registryPath = (flags.registry || flags.r || './dist/registry.js') as string

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
  const envFile = flags['env-file']
  if (envFile && typeof envFile === 'string') {
    try {
      const fileEnv = loadEnvFile(envFile)
      Object.assign(env, fileEnv)
    } catch (error) {
      console.error(`Error loading env file: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  // Parse --env flags from raw args
  const cliEnv = parseEnvFlags(args)
  Object.assign(env, cliEnv)

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

  // Create context - CLI uses agent trigger with minimal context
  // Note: CLI invoke is for local dev testing, so we use a minimal context
  const context: AgentToolContext = {
    trigger: 'agent',
    app: { id: 'cli', versionId: 'local' },
    appInstallationId: 'cli-local',
    workplace: { id: 'cli', subdomain: 'local' },
    request: { url: 'cli://invoke', params: {}, query: {} },
    env,
    mode: estimateMode ? 'estimate' : 'execute',
  }

  // Execute tool
  console.error(`Invoking tool: ${tool.name}`)
  if (estimateMode) {
    console.error('Mode: estimate (billing only)')
  }

  try {
    const handler = tool.handler as (input: unknown, context: ToolExecutionContext) => Promise<{ output: unknown; billing: { credits: number } }>

    const result = await handler(validatedArgs, context)

    // Output result
    if (estimateMode) {
      console.log(formatJson({ billing: result.billing }))
    } else {
      console.log(formatJson({
        output: result.output,
        billing: result.billing,
      }))
    }
  } catch (error) {
    console.error('Error executing tool:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

