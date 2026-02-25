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
  ToolRegistry,
  ToolExecutionContext,
  AgentToolContext,
  ToolExecutionResult,
} from '../../types'
import { createContextLogger } from '../../server/logger'
import { getCredentials, callCliApi } from '../utils/auth'
import { getLinkConfig, loadEnvFile as loadLinkedEnvFile } from '../utils/link'
import { findRegistryPath } from '../utils/config'
import { file, configure } from '../../core/client'

/**
 * Simple MIME type lookup based on file extension.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * Upload a local file and return its file ID.
 */
async function uploadLocalFile(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath)
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`)
  }
  
  const content = fs.readFileSync(absolutePath)
  const fileName = path.basename(absolutePath)
  const mimeType = getMimeType(absolutePath)
  
  console.error(`Uploading file: ${fileName} (${mimeType}, ${content.length} bytes)...`)
  
  const result = await file.upload({
    content,
    name: fileName,
    mimeType,
  })
  
  console.error(`Uploaded: ${fileName} -> ${result.id}`)
  return result.id
}

/**
 * Process upload templates in args object.
 * Recursively scans all string values and replaces {{upload:/path/to/file}} patterns
 * with the uploaded file ID.
 */
async function processUploadTemplates(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      const match = value.match(/^\{\{upload:(.+)\}\}$/)
      if (match) {
        const filePath = match[1]
        const fileId = await uploadLocalFile(filePath)
        result[key] = fileId
      } else {
        result[key] = value
      }
    } else if (Array.isArray(value)) {
      result[key] = await Promise.all(
        value.map(async (item) => {
          if (typeof item === 'string') {
            const match = item.match(/^\{\{upload:(.+)\}\}$/)
            if (match) {
              return await uploadLocalFile(match[1])
            }
          } else if (item && typeof item === 'object') {
            return await processUploadTemplates(item as Record<string, unknown>)
          }
          return item
        })
      )
    } else if (value && typeof value === 'object') {
      result[key] = await processUploadTemplates(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  
  return result
}

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
                      Supports {{upload:/path/to/file}} syntax for file uploads
  --env, -e           Set environment variable (can be used multiple times)
                      Format: --env KEY=VALUE
  --env-file          Load environment variables from a file (e.g., .env.local)
  --estimate          Run in estimate mode (billing only, no execution)
  --help, -h          Show this help message

Workplace Options:
  --workplace, -w     Workplace subdomain (auto-detected if only one is linked)
                      Loads env vars from .skedyul/env/{workplace}.env

File Upload Syntax:
  Use {{upload:/path/to/file}} in any string field within --args to automatically
  upload a local file and replace the template with the uploaded file ID.

Examples:
  # Basic invocation (auto-detects workspace if only one is linked)
  skedyul dev invoke appointment_types_list

  # Specify workplace explicitly
  skedyul dev invoke appointment_types_list --workplace crux

  # With arguments
  skedyul dev invoke create_booking --args '{"date": "2024-01-15"}'

  # With file upload (uploads file and injects file_id)
  skedyul dev invoke parse_lab_report \\
    --args '{"file_id": "{{upload:/path/to/report.pdf}}"}'

  # Multiple file uploads in one command
  skedyul dev invoke process_documents \\
    --args '{"doc": "{{upload:./doc.pdf}}", "image": "{{upload:./photo.jpg}}"}'

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
      
      // Configure the skedyul client for file uploads
      configure({
        baseUrl: linkConfig.serverUrl,
        apiToken: workplaceToken,
      })
    } catch (error) {
      console.error(`Failed to get API token: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  // Process upload templates in args (e.g., {{upload:/path/to/file}})
  if (isLinked) {
    try {
      toolArgs = await processUploadTemplates(toolArgs)
    } catch (error) {
      console.error(`Error processing file uploads: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  // Check for estimate mode
  const estimateMode = Boolean(flags.estimate)

  // Load registry
  let registry: ToolRegistry
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
      log: createContextLogger(),
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
      log: createContextLogger(),
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

