import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod'

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

// Install context-aware logger at module load time
installContextLogger()

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
  mergeRuntimeEnv()

  if (config.coreApi?.service) {
    coreApiService.register(config.coreApi.service)
    if (config.coreApi.webhookHandler) {
      coreApiService.setWebhookHandler(config.coreApi.webhookHandler)
    }
  }

  const tools = buildToolMetadata(registry)
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

  const state = createRequestState(
    maxRequests,
    ttlExtendSeconds,
    runtimeLabel,
    toolNames,
  )

  const mcpServer = new McpServer({
      name: config.metadata.name,
      version: config.metadata.version,
  })

  const dedicatedShutdown = () => {
    // eslint-disable-next-line no-console
    console.log('Max requests reached, shutting down...')
    setTimeout(() => process.exit(0), 1000)
  }

  const callTool = createCallToolHandler(
    registry,
    state,
    config.computeLayer === 'dedicated' ? dedicatedShutdown : undefined,
  )

  // Register all tools from the registry
  for (const [toolKey, tool] of Object.entries(registry)) {
    // Use the tool's name or fall back to the registry key
    const toolName = tool.name || toolKey
    const toolDisplayName = tool.label || toolName
    const inputZodSchema = getZodSchema(tool.inputSchema)
    const outputZodSchema = getZodSchema(tool.outputSchema)

    // Wrap the input schema to accept Skedyul format: { inputs: {...}, env: {...} }
    // This allows the MCP SDK to pass through the wrapper without stripping fields
    const wrappedInputSchema = z.object({
      inputs: inputZodSchema ?? z.record(z.string(), z.unknown()).optional(),
      env: z.record(z.string(), z.string()).optional(),
    }).passthrough()

    mcpServer.registerTool(
      toolName,
      {
        title: toolDisplayName,
        description: tool.description,
        inputSchema: wrappedInputSchema,
        outputSchema: outputZodSchema,
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
        if (result.error) {
          const errorOutput = { error: result.error }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(errorOutput) }],
            structuredContent: errorOutput,
            isError: true,
            billing: result.billing,
          }
        }

        // Transform internal format to MCP protocol format
        // Note: effect is embedded in structuredContent because the MCP SDK
        // transport strips custom top-level fields in dedicated mode
        const outputData = result.output as Record<string, unknown> | null
        const structuredContent = outputData
          ? { ...outputData, __effect: result.effect }
          : result.effect
            ? { __effect: result.effect }
            : undefined
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result.output) }],
          structuredContent,
          billing: result.billing,
        }
      },
    )
  }

  if (config.computeLayer === 'dedicated') {
    return createDedicatedServerInstance(
      config,
      tools,
      callTool,
      state,
      mcpServer,
      webhookRegistry,
    )
  }

  return createServerlessInstance(config, tools, callTool, state, mcpServer, registry, webhookRegistry)
}

export const server = {
  create: createSkedyulServer,
}
