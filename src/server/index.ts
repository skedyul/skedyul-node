import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod'

import type {
  DedicatedServerInstance,
  ServerlessServerInstance,
  SkedyulServerInstance,
  ToolRegistry,
  WebhookRegistry,
} from '../types'
import type { SkedyulConfig } from '../config/app-config'
import { coreApiService } from '../core/service'
import { buildToolMetadata, createRequestState, createCallToolHandler } from './tool-handler'
import { createDedicatedServerInstance } from './dedicated'
import { createServerlessInstance } from './serverless'
import { mergeRuntimeEnv, parseNumberEnv, getZodSchema } from './utils'
import {
  serializeMcpContentText,
  isToolCallFailure,
  buildToolCallErrorOutput,
} from './utils/mcp-response'
import { installContextLogger } from './context-logger'

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

// Re-export route handlers
export { routeRequest } from './route-handlers'
export type { UnifiedRequest, UnifiedResponse, RouteContext } from './route-handlers'

/**
 * Runtime config type - SkedyulConfig with resolved registries (not promises).
 * This is what server.create() expects at runtime.
 */
export type RuntimeSkedyulConfig = Omit<SkedyulConfig, 'tools' | 'webhooks'> & {
  tools: ToolRegistry
  webhooks?: WebhookRegistry
}

// Overload signatures for proper type inference based on computeLayer
export function createSkedyulServer(
  config: RuntimeSkedyulConfig & { computeLayer: 'dedicated' },
): DedicatedServerInstance
export function createSkedyulServer(
  config: RuntimeSkedyulConfig & { computeLayer: 'serverless' },
): ServerlessServerInstance
export function createSkedyulServer(
  config: RuntimeSkedyulConfig,
): SkedyulServerInstance
export function createSkedyulServer(
  config: RuntimeSkedyulConfig,
): SkedyulServerInstance {
  mergeRuntimeEnv()

  // Extract registries from config
  const registry = config.tools
  const webhookRegistry = config.webhooks

  if (config.coreApi?.service) {
    coreApiService.register(config.coreApi.service)
    if (config.coreApi.webhookHandler) {
      coreApiService.setWebhookHandler(config.coreApi.webhookHandler)
    }
  }

  const tools = buildToolMetadata(registry)

  const toolNames = Object.values(registry).map((tool) => tool.name)
  const runtimeLabel = config.computeLayer ?? 'serverless'
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
      name: config.name,
      version: config.version ?? '0.0.0',
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

  for (const [toolKey, tool] of Object.entries(registry)) {
    // Use the tool's name or fall back to the registry key
    const toolName = tool.name || toolKey
    const toolDisplayName = tool.label || toolName

    const inputZodSchema = getZodSchema(tool.inputSchema)
    const outputZodSchema = getZodSchema(tool.outputSchema)

    // Wrap the input schema to accept Skedyul format: { inputs: {...}, context: {...}, env: {...}, invocation: {...} }
    // All fields must be explicitly defined to prevent MCP SDK from stripping them during validation
    const wrappedInputSchema = z.object({
      inputs: inputZodSchema ?? z.record(z.string(), z.unknown()).optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      invocation: z.record(z.string(), z.unknown()).optional(),
      estimate: z.boolean().optional(),
    }).passthrough()

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
        if (isToolCallFailure(result)) {
          const errorOutput = buildToolCallErrorOutput(result)
          return {
            content: [{ type: 'text' as const, text: serializeMcpContentText(errorOutput) }],
            // Don't provide structuredContent for error responses when tool has outputSchema
            // because the error response won't match the success schema and MCP SDK validates it
            structuredContent: hasOutputSchema ? undefined : errorOutput,
            isError: true,
            billing: result.billing,
          }
        }

        // Transform internal format to MCP protocol format
        // Note: effect and dataBlocks are embedded in structuredContent because the MCP SDK
        // transport strips custom top-level fields in dedicated mode
        const rawOutput =
          'output' in result
            ? (result.output as Record<string, unknown> | null | undefined)
            : null
        const outputData = rawOutput ?? null
        const dataBlocks = result.dataBlocks as unknown[] | undefined
        // MCP SDK requires structuredContent when outputSchema is defined
        // Always provide it (even as empty object) to satisfy validation
        let structuredContent: Record<string, unknown> | undefined
        if (outputData) {
          structuredContent = {
            ...outputData,
            __effect: result.effect,
            __dataBlocks: dataBlocks,
          }
        } else if (result.effect || dataBlocks) {
          structuredContent = {
            __effect: result.effect,
            __dataBlocks: dataBlocks,
          }
        } else if (hasOutputSchema) {
          // Tool has outputSchema but returned null/undefined output
          // Provide empty object to satisfy MCP SDK validation
          structuredContent = {}
        }

        return {
          // Ensure text is always a string - JSON.stringify(undefined) returns undefined, not a string
          content: [{ type: 'text' as const, text: serializeMcpContentText(outputData) }],
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
    )
  }

  return createServerlessInstance(config, tools, callTool, state, mcpServer)
}

export const server = {
  create: createSkedyulServer,
}
