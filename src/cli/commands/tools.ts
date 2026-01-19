import * as z from 'zod'
import { parseArgs, loadRegistry, formatJson } from '../utils'

function printHelp(): void {
  console.log(`
skedyul dev tools - List all tools in the registry

Usage:
  skedyul dev tools [options]

Options:
  --registry, -r      Path to the registry file (default: ./dist/registry.js)
  --json              Output as JSON (for programmatic use)
  --verbose, -v       Show full input/output schemas
  --help, -h          Show this help message

Examples:
  # List all tools
  skedyul dev tools --registry ./dist/registry.js

  # Output as JSON
  skedyul dev tools --registry ./dist/registry.js --json

  # Show full schemas
  skedyul dev tools --registry ./dist/registry.js --verbose
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

export async function toolsCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  // Get registry path
  const registryPath = (flags.registry || flags.r || './dist/registry.js') as string
  const jsonOutput = Boolean(flags.json)
  const verbose = Boolean(flags.verbose || flags.v)

  // Load registry
  let registry
  try {
    registry = await loadRegistry(registryPath)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const tools: ToolInfo[] = []

  for (const [key, tool] of Object.entries(registry)) {
    const inputZod = getZodSchema(tool.inputs)
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

