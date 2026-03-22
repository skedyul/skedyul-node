import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod'

console.log('[skedyul-node/server] Module loading - imports done')

import type {
  DedicatedServerInstance,
  ServerlessServerInstance,
  SkedyulServerConfig,
  SkedyulServerInstance,
  ToolRegistry,
  WebhookRegistry,
} from '../types'
import { coreApiService } from '../core/service'
import { buildToolMetadata, createRequestState, createCallToolHandler } from './tool-handler'
import { createDedicatedServerInstance } from './dedicated'
import { createServerlessInstance } from './serverless'
import { mergeRuntimeEnv, parseNumberEnv, getZodSchema } from './utils'
import { installContextLogger } from './context-logger'

console.log('[skedyul-node/server] All imports complete')

// Install context-aware logger at module load time
console.log('[skedyul-node/server] Installing context logger...')
installContextLogger()
console.log('[skedyul-node/server] Context logger installed')

// Re-export types
export type { RequestState, CoreMethod, ToolCallArgs } from './types'

// Re-export utilities
export {
  normalizeBilling,
  toJsonSchema,
  isToolSchemaWithJson,
  getZodSchema,
  getJsonSchemaFromToolSchema,
  parseJsonRecord,
  parseNumberEnv,
  mergeRuntimeEnv,
  readRawRequestBody,
  parseJSONBody,
  sendJSON,
  sendHTML,
  getDefaultHeaders,
  createResponse,
  getListeningPort,
} from './utils'

// Re-export handlers
export { handleCoreMethod } from './core-api-handler'
export { buildToolMetadata, createRequestState, createCallToolHandler } from './tool-handler'
export { parseHandlerEnvelope, buildRequestFromRaw, buildRequestScopedConfig } from './handler-helpers'
export { printStartupLog, padEnd } from './startup-logger'
export { createDedicatedServerInstance } from './dedicated'
export { createServerlessInstance } from './serverless'
export { runWithLogContext, getLogContext, installContextLogger, uninstallContextLogger } from './context-logger'

// Overload signatures for proper type inference based on computeLayer
export function createSkedyulServer(
  config: SkedyulServerConfig & { computeLayer: 'dedicated' },
  registry: ToolRegistry,
  webhookRegistry?: WebhookRegistry,
): DedicatedServerInstance
export function createSkedyulServer(
  config: SkedyulServerConfig & { computeLayer: 'serverless' },
  registry: ToolRegistry,
  webhookRegistry?: WebhookRegistry,
): ServerlessServerInstance
export function createSkedyulServer(
  config: SkedyulServerConfig,
  registry: ToolRegistry,
  webhookRegistry?: WebhookRegistry,
): SkedyulServerInstance
export function createSkedyulServer(
  config: SkedyulServerConfig,
  registry: ToolRegistry,
  webhookRegistry?: WebhookRegistry,
): SkedyulServerInstance {
  console.log('[createSkedyulServer] Step 1: mergeRuntimeEnv()')
  mergeRuntimeEnv()

  console.log('[createSkedyulServer] Step 2: coreApi setup')
  if (config.coreApi?.service) {
    coreApiService.register(config.coreApi.service)
    if (config.coreApi.webhookHandler) {
      coreApiService.setWebhookHandler(config.coreApi.webhookHandler)
    }
  }

  console.log('[createSkedyulServer] Step 3: buildToolMetadata()')
  const tools = buildToolMetadata(registry)
  console.log('[createSkedyulServer] Step 3 done, tools:', tools.length)
  
  const toolNames = Object.values(registry).map((tool) => tool.name)
  const runtimeLabel = config.computeLayer
  const maxRequests =
    config.maxRequests ??
    parseNumberEnv(process.env.MCP_MAX_REQUESTS) ??
    null
  const ttlExtendSeconds =
    config.ttlExtendSeconds ??
    parseNumberEnv(process.env.MCP_TTL_EXTEND) ??
    3600

  console.log('[createSkedyulServer] Step 4: createRequestState()')
  const state = createRequestState(
    maxRequests,
    ttlExtendSeconds,
    runtimeLabel,
    toolNames,
  )
  console.log('[createSkedyulServer] Step 4 done')

  console.log('[createSkedyulServer] Step 5: new McpServer()')
  const mcpServer = new McpServer({
      name: config.metadata.name,
      version: config.metadata.version,
  })
  console.log('[createSkedyulServer] Step 5 done')

  const dedicatedShutdown = () => {
    // eslint-disable-next-line no-console
    console.log('Max requests reached, shutting down...')
    setTimeout(() => process.exit(0), 1000)
  }

  console.log('[createSkedyulServer] Step 6: createCallToolHandler()')
  const callTool = createCallToolHandler(
    registry,
    state,
    config.computeLayer === 'dedicated' ? dedicatedShutdown : undefined,
  )
  console.log('[createSkedyulServer] Step 6 done')

  // Register all tools from the registry
  console.log('[createSkedyulServer] Step 7: Registering tools...')
  for (const [toolKey, tool] of Object.entries(registry)) {
    console.log(`[createSkedyulServer] Registering tool: ${toolKey}`)
    // Use the tool's name or fall back to the registry key
    const toolName = tool.name || toolKey
    const toolDisplayName = tool.label || toolName
    
    console.log(`[createSkedyulServer] Getting input schema for ${toolKey}`)
    const inputZodSchema = getZodSchema(tool.inputSchema)
    console.log(`[createSkedyulServer] Getting output schema for ${toolKey}`)
    const outputZodSchema = getZodSchema(tool.outputSchema)

    // Wrap the input schema to accept Skedyul format: { inputs: {...}, context: {...}, env: {...}, invocation: {...} }
    // All fields must be explicitly defined to prevent MCP SDK from stripping them during validation
    console.log(`[createSkedyulServer] Creating wrapped schema for ${toolKey}`)
    const wrappedInputSchema = z.object({
      inputs: inputZodSchema ?? z.record(z.string(), z.unknown()).optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      invocation: z.record(z.string(), z.unknown()).optional(),
      estimate: z.boolean().optional(),
    }).passthrough()

    console.log(`[createSkedyulServer] Calling mcpServer.registerTool for ${toolKey}`)
    mcpServer.registerTool(
      toolName,
      {
        title: toolDisplayName,
        description: tool.description,
        inputSchema: wrappedInputSchema,
        // Don't pass outputSchema to MCP SDK - it validates structuredContent against it
        // which fails for error responses. We handle output formatting ourselves.
        // outputSchema: outputZodSchema,
      },
      async (args: unknown) => {
        // Args are in Skedyul format: { inputs: {...}, context: {...}, env: {...}, invocation: {...} }
        const rawArgs = args as Record<string, unknown>
        const toolInputs = (rawArgs.inputs ?? {}) as Record<string, unknown>
        const toolContext = rawArgs.context as Record<string, unknown> | undefined
        const toolEnv = rawArgs.env as Record<string, string> | undefined
        const toolInvocation = rawArgs.invocation as Record<string, unknown> | undefined

        // Validate inputs if schema exists
        let validatedInputs = toolInputs
        if (inputZodSchema) {
          try {
            validatedInputs = inputZodSchema.parse(toolInputs) as Record<string, unknown>
          } catch (error) {
            console.error(
              `[registerTool] Input validation failed for tool ${toolName}:`,
              error,
            )
            // Return error response instead of throwing
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: `Input validation failed: ${error instanceof Error ? error.message : String(error)}`,
                  }),
                },
              ],
              structuredContent: {
                error: `Input validation failed: ${error instanceof Error ? error.message : String(error)}`,
              },
              isError: true,
              billing: { credits: 0 },
            }
          }
        }
        const result = await callTool(toolKey, {
          inputs: validatedInputs,
          context: toolContext,
          env: toolEnv,
          invocation: toolInvocation,
        })

        // Handle error case
        const hasOutputSchema = Boolean(outputZodSchema)
        if (result.error) {
          const errorOutput = { error: result.error }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(errorOutput) }],
            // Don't provide structuredContent for error responses when tool has outputSchema
            // because the error response won't match the success schema and MCP SDK validates it
            structuredContent: hasOutputSchema ? undefined : errorOutput,
            isError: true,
            billing: result.billing,
          }
        }

        // Transform internal format to MCP protocol format
        // Note: effect is embedded in structuredContent because the MCP SDK
        // transport strips custom top-level fields in dedicated mode
        const outputData = result.output as Record<string, unknown> | null
        // MCP SDK requires structuredContent when outputSchema is defined
        // Always provide it (even as empty object) to satisfy validation
        let structuredContent: Record<string, unknown> | undefined
        if (outputData) {
          structuredContent = { ...outputData, __effect: result.effect }
        } else if (result.effect) {
          structuredContent = { __effect: result.effect }
        } else if (hasOutputSchema) {
          // Tool has outputSchema but returned null/undefined output
          // Provide empty object to satisfy MCP SDK validation
          structuredContent = {}
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result.output) }],
          structuredContent,
          billing: result.billing,
        }
      },
    )
    console.log(`[createSkedyulServer] Tool ${toolKey} registered successfully`)
  }
  console.log('[createSkedyulServer] Step 7 done - all tools registered')

  console.log('[createSkedyulServer] Step 8: Creating server instance')
  if (config.computeLayer === 'dedicated') {
    console.log('[createSkedyulServer] Creating dedicated instance')
    return createDedicatedServerInstance(
      config,
      tools,
      callTool,
      state,
      mcpServer,
      webhookRegistry,
    )
  }

  console.log('[createSkedyulServer] Creating serverless instance')
  const serverlessInstance = createServerlessInstance(config, tools, callTool, state, mcpServer, registry, webhookRegistry)
  console.log('[createSkedyulServer] Serverless instance created successfully')
  return serverlessInstance
}

export const server = {
  create: createSkedyulServer,
}
