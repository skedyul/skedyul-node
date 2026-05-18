import * as z from 'zod'
import { parseArgs, loadRegistry, formatJson } from '../utils'
import { getCredentials, getServerUrl, callCliApi } from '../utils/auth'
import type { ToolRegistry } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WorkplaceTokenResponse {
  token: string
  expiresAt: string
  workplaceId: string
  workplaceName: string
  workplaceSubdomain: string
}

interface SyncResult {
  modelId: string
  modelHandle: string
  modelName: string
  toolsUpdated: number
}

interface SyncResponse {
  success: boolean
  message: string
  results: SyncResult[]
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
skedyul tools - Manage tools

Usage:
  skedyul tools <command> [options]

Commands:
  list          List all tools in a registry (dev mode)
  sync          Sync tool schemas for a workplace (re-generates enum constraints)

List Options (dev mode):
  --registry, -r      Path to the registry file (default: ./dist/registry.js)
  --json              Output as JSON (for programmatic use)
  --verbose, -v       Show full input/output schemas

Sync Options:
  --workplace, -w     Workplace subdomain (required)
  --model, -m         Specific model handle to sync (optional, syncs all if omitted)
  --json              Output as JSON

Examples:
  # List all tools in dev registry
  skedyul tools list --registry ./dist/registry.js

  # Sync all tool schemas for a workplace
  skedyul tools sync --workplace gym-demo

  # Sync tool schemas for a specific model
  skedyul tools sync --workplace gym-demo --model prospect
`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getWorkplaceToken(
  workplaceSubdomain: string,
  serverUrl: string,
  cliToken: string,
): Promise<WorkplaceTokenResponse> {
  return callCliApi<WorkplaceTokenResponse>(
    { serverUrl, token: cliToken },
    '/workplace-token',
    { workplaceSubdomain },
  )
}

function ensureAuth(): { token: string; serverUrl: string } {
  const credentials = getCredentials()
  if (!credentials?.token) {
    console.error('Error: Not authenticated')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }
  return { token: credentials.token, serverUrl: getServerUrl() }
}

// ─────────────────────────────────────────────────────────────────────────────
// List Command (dev mode)
// ─────────────────────────────────────────────────────────────────────────────

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

function toJsonSchema(schema?: z.ZodTypeAny): Record<string, unknown> | undefined {
  if (!schema) return undefined
  try {
    // Use Zod v4 native JSON Schema conversion
    return z.toJSONSchema(schema, {
      unrepresentable: 'any',
    }) as Record<string, unknown>
  } catch {
    return undefined
  }
}

interface ToolInfo {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

async function handleList(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  // Get registry path
  const registryPath = (flags.registry || flags.r || './dist/registry.js') as string
  const jsonOutput = Boolean(flags.json)
  const verbose = Boolean(flags.verbose || flags.v)

  // Load registry
  let registry: ToolRegistry
  try {
    registry = await loadRegistry(registryPath)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const tools: ToolInfo[] = []

  for (const [key, tool] of Object.entries(registry)) {
    const inputZod = getZodSchema(tool.inputSchema)
    const outputZod = getZodSchema(tool.outputSchema)

    tools.push({
      name: tool.name || key,
      description: tool.description || '',
      inputSchema: verbose ? toJsonSchema(inputZod) : undefined,
      outputSchema: verbose ? toJsonSchema(outputZod) : undefined,
    })
  }

  if (jsonOutput) {
    console.log(formatJson(tools))
    return
  }

  // Human-readable output
  console.log(`\nFound ${tools.length} tool(s) in registry:\n`)

  for (const tool of tools) {
    console.log(`  ${tool.name}`)
    if (tool.description) {
      console.log(`    ${tool.description}`)
    }

    if (verbose && tool.inputSchema) {
      console.log('\n    Input Schema:')
      const schemaStr = formatJson(tool.inputSchema)
      const indented = schemaStr.split('\n').map(line => `      ${line}`).join('\n')
      console.log(indented)
    }

    if (verbose && tool.outputSchema) {
      console.log('\n    Output Schema:')
      const schemaStr = formatJson(tool.outputSchema)
      const indented = schemaStr.split('\n').map(line => `      ${line}`).join('\n')
      console.log(indented)
    }

    console.log('')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Command
// ─────────────────────────────────────────────────────────────────────────────

async function handleSync(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  const workplace = (flags.workplace || flags.w) as string | undefined
  const modelHandle = (flags.model || flags.m) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul tools sync --workplace gym-demo')
    process.exit(1)
  }

  // Get auth
  const { token, serverUrl } = ensureAuth()

  // Get workplace token
  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  if (!jsonOutput) {
    console.log('')
    console.log(`🔄 Syncing tool schemas for ${workplace}${modelHandle ? ` (model: ${modelHandle})` : ''}...`)
    console.log('')
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/tools/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workplaceId: workplaceToken.workplaceId,
        modelHandle,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as SyncResponse

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (!result.success) {
      throw new Error(result.error || 'Sync failed')
    }

    console.log(`✅ ${result.message}`)
    console.log('')

    if (result.results.length > 0) {
      console.log('Models synced:')
      for (const r of result.results) {
        console.log(`  • ${r.modelName} (${r.modelHandle}): ${r.toolsUpdated} tool(s)`)
      }
      console.log('')
    }
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

export async function toolsCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  // Handle legacy usage (no subcommand = list)
  if (!subcommand || subcommand.startsWith('-')) {
    // Legacy: treat as list command
    await handleList(args)
    return
  }

  if (subcommand === '--help' || subcommand === '-h') {
    printHelp()
    return
  }

  const subArgs = args.slice(1)

  switch (subcommand) {
    case 'list':
      await handleList(subArgs)
      break
    case 'sync':
      await handleSync(subArgs)
      break
    default:
      console.error(`Error: Unknown subcommand: ${subcommand}`)
      console.error("Run 'skedyul tools --help' for usage information.")
      process.exit(1)
  }
}

