import * as fs from 'fs'
import * as path from 'path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type {
  APIGatewayProxyEvent,
  SkedyulServerInstance,
  ToolCallResponse,
  ToolMetadata,
  ToolRegistryEntry,
  InvocationContext,
} from '../types'
import type { RuntimeSkedyulConfig } from './index'
import type { WebhookRequest as CoreWebhookRequest } from '../core/types'
import type { RequestState, CoreMethod } from './types'
import { coreApiService } from '../core/service'
import { handleCoreMethod } from './core-api-handler'
import { printStartupLog } from './startup-logger'
import { getZodSchema, getDefaultHeaders, createResponse } from './utils'
import { serializeConfig } from './config-serializer'
import {
  handleInstall,
  handleUninstall,
  handleProvision,
  handleOAuthCallback,
  parseWebhookRequest,
  executeWebhookHandler,
  isMethodAllowed,
  type InstallRequestBody,
  type UninstallRequestBody,
  type ProvisionRequestBody,
} from './handlers'

/**
 * Path to pre-generated config file (created during Docker build).
 * In Lambda, LAMBDA_TASK_ROOT is /var/task where files are copied.
 * We use an absolute path to avoid issues with process.cwd() not matching LAMBDA_TASK_ROOT.
 */
const CONFIG_FILE_PATH = process.env.LAMBDA_TASK_ROOT
  ? path.join(process.env.LAMBDA_TASK_ROOT, '.skedyul', 'config.json')
  : '.skedyul/config.json'

/**
 * Creates a serverless (Lambda-style) server instance
 */
export function createServerlessInstance(
  config: RuntimeSkedyulConfig,
  tools: ToolMetadata[],
  callTool: (toolNameInput: unknown, toolArgsInput: unknown) => Promise<ToolCallResponse>,
  state: RequestState,
  mcpServer: McpServer,
): SkedyulServerInstance {
  const headers = getDefaultHeaders(config.cors)
  const registry = config.tools
  const webhookRegistry = config.webhooks

  // Print startup log once on cold start
  let hasLoggedStartup = false

  return {
    async handler(event: APIGatewayProxyEvent) {
      // Log startup info on first invocation (cold start)
      if (!hasLoggedStartup) {
        printStartupLog(config, tools)
        hasLoggedStartup = true
      }
      try {
        // Lambda Function URLs use rawPath instead of path
        // API Gateway uses path
        const path = event.path || (event as unknown as { rawPath?: string }).rawPath || '/'
        const method = event.httpMethod || (event as unknown as { requestContext?: { http?: { method?: string } } }).requestContext?.http?.method || 'POST'

        if (method === 'OPTIONS') {
          return createResponse(200, { message: 'OK' }, headers)
        }

        // Handle webhook requests: /webhooks/{handle}
        if (path.startsWith('/webhooks/') && webhookRegistry) {
          const handle = path.slice('/webhooks/'.length)

          if (!webhookRegistry[handle]) {
            return createResponse(404, { error: `Webhook handler '${handle}' not found` }, headers)
          }

          // Check if HTTP method is allowed
          if (!isMethodAllowed(webhookRegistry, handle, method)) {
            return createResponse(405, { error: `Method ${method} not allowed` }, headers)
          }

          // Get raw body
          const rawBody = event.body ?? ''

          // Parse body based on content type
          let parsedBody: unknown
          const contentType = event.headers?.['content-type'] ?? event.headers?.['Content-Type'] ?? ''
          if (contentType.includes('application/json')) {
            try {
              parsedBody = rawBody ? JSON.parse(rawBody) : {}
            } catch {
              parsedBody = rawBody
            }
          } else {
            parsedBody = rawBody
          }

          // Build URL for direct requests
          const forwardedProto =
            event.headers?.['x-forwarded-proto'] ??
            event.headers?.['X-Forwarded-Proto']
          const protocol = forwardedProto ?? 'https'
          const host = event.headers?.host ?? event.headers?.Host ?? 'localhost'
          const queryString = event.queryStringParameters
            ? '?' + new URLSearchParams(event.queryStringParameters as Record<string, string>).toString()
            : ''
          const webhookUrl = `${protocol}://${host}${path}${queryString}`

          // Parse webhook request using shared handler
          const parseResult = parseWebhookRequest(
            parsedBody,
            method,
            webhookUrl,
            path,
            event.headers as Record<string, string | string[] | undefined>,
            event.queryStringParameters ?? {},
            rawBody,
            event.headers?.['x-skedyul-app-id'] ?? event.headers?.['X-Skedyul-App-Id'],
            event.headers?.['x-skedyul-app-version-id'] ?? event.headers?.['X-Skedyul-App-Version-Id'],
          )

          if ('error' in parseResult) {
            return createResponse(400, { error: parseResult.error }, headers)
          }

          // Execute webhook handler
          const result = await executeWebhookHandler(handle, webhookRegistry, parseResult)

          // Build response headers
          const responseHeaders: Record<string, string> = {
            ...headers,
            ...result.headers,
          }

          return {
            statusCode: result.status,
            headers: responseHeaders,
            body: result.body !== undefined
              ? (typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
              : '',
          }
        }

        if (path === '/core' && method === 'POST') {
          let coreBody: any

          try {
            coreBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              {
                error: {
                  code: -32700,
                  message: 'Parse error',
                },
              },
              headers,
            )
          }

          if (!coreBody?.method) {
            return createResponse(
              400,
              {
                error: {
                  code: -32602,
                  message: 'Missing method',
                },
              },
              headers,
            )
          }

          const coreMethod = coreBody.method as CoreMethod
          const result = await handleCoreMethod(coreMethod, coreBody.params)
          return createResponse(result.status, result.payload, headers)
        }

        if (path === '/core/webhook' && method === 'POST') {
          const rawWebhookBody = event.body ?? ''

          let webhookBody: unknown
          try {
            webhookBody = rawWebhookBody ? JSON.parse(rawWebhookBody) : {}
          } catch {
            return createResponse(
              400,
              { status: 'parse-error' },
              headers,
            )
          }

          const forwardedProto =
            event.headers?.['x-forwarded-proto'] ??
            event.headers?.['X-Forwarded-Proto']
          const protocol = forwardedProto ?? 'https'
          const host = event.headers?.host ?? event.headers?.Host ?? 'localhost'
          const webhookUrl = `${protocol}://${host}${path}`

          const coreWebhookRequest: CoreWebhookRequest = {
            method,
            headers: (event.headers ?? {}) as Record<string, string>,
            body: webhookBody,
            query: event.queryStringParameters ?? {},
            url: webhookUrl,
            path: path,
            rawBody: rawWebhookBody
              ? Buffer.from(rawWebhookBody, 'utf-8')
              : undefined,
          }

          const webhookResponse = await coreApiService.dispatchWebhook(
            coreWebhookRequest,
          )

          return createResponse(
            webhookResponse.status,
            webhookResponse.body ?? {},
            headers,
          )
        }

        if (path === '/estimate' && method === 'POST') {
          let estimateBody: any

          try {
            estimateBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              {
                error: {
                  code: -32700,
                  message: 'Parse error',
                },
              },
              headers,
            )
          }

          try {
            const toolName = estimateBody.name as string
            const toolArgs = estimateBody.inputs ?? {}

            // Find tool by name
            let toolKey: string | null = null
            let tool: ToolRegistryEntry | null = null

            for (const [key, t] of Object.entries(registry)) {
              if (t.name === toolName || key === toolName) {
                toolKey = key
                tool = t
                break
              }
            }

            if (!tool || !toolKey) {
              return createResponse(
                400,
                {
                  error: {
                    code: -32602,
                    message: `Tool "${toolName}" not found`,
                  },
                },
                headers,
              )
            }

            const inputSchema = getZodSchema(tool.inputSchema)
            // Validate arguments against Zod schema
            const validatedArgs = inputSchema ? inputSchema.parse(toolArgs) : toolArgs
            const estimateResponse = await callTool(toolKey, {
              inputs: validatedArgs,
              estimate: true,
            })

            return createResponse(
              200,
              {
                billing: estimateResponse.billing ?? { credits: 0 },
              },
              headers,
            )
          } catch (err) {
            return createResponse(
              500,
              {
                error: {
                  code: -32603,
                  message: err instanceof Error ? err.message : String(err ?? ''),
                },
              },
              headers,
            )
          }
        }

        // Handle /install endpoint for install handlers
        if (path === '/install' && method === 'POST') {
          let installBody: InstallRequestBody

          try {
            installBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              { error: { code: -32700, message: 'Parse error' } },
              headers,
            )
          }

          const result = await handleInstall(installBody, config.hooks)
          return createResponse(result.status, result.body, headers)
        }

        // Handle /uninstall endpoint for uninstall handlers
        if (path === '/uninstall' && method === 'POST') {
          let uninstallBody: UninstallRequestBody

          try {
            uninstallBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              { error: { code: -32700, message: 'Parse error' } },
              headers,
            )
          }

          const result = await handleUninstall(uninstallBody, config.hooks)
          return createResponse(result.status, result.body, headers)
        }

        // Handle /provision endpoint for provision handlers
        if (path === '/provision' && method === 'POST') {
          let provisionBody: ProvisionRequestBody

          try {
            provisionBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              { error: { code: -32700, message: 'Parse error' } },
              headers,
            )
          }

          const result = await handleProvision(provisionBody, config.hooks)
          return createResponse(result.status, result.body, headers)
        }

        // Handle /oauth_callback endpoint for OAuth callbacks (called by platform route)
        if (path === '/oauth_callback' && method === 'POST') {
          let parsedBody: unknown
          try {
            parsedBody = event.body ? JSON.parse(event.body) : {}
          } catch (err) {
            console.error('[OAuth Callback] Failed to parse JSON body:', err)
            return createResponse(
              400,
              { error: { code: -32700, message: 'Parse error' } },
              headers,
            )
          }

          const result = await handleOAuthCallback(parsedBody, config.hooks)
          return createResponse(result.status, result.body, headers)
        }

        if (path === '/health' && method === 'GET') {
          return createResponse(200, state.getHealthStatus(), headers)
        }

        // GET /config - Returns app configuration metadata
        // Used by deployment workflow to extract tool timeouts, webhooks, etc.
        // Reads from pre-generated .skedyul/config.json (created during build)
        // Falls back to runtime serialization for local dev without build
        if (path === '/config' && method === 'GET') {
          // Try to read pre-generated config file first (created by skedyul config:export)
          try {
            console.log(`[/config] Checking for config file at: ${CONFIG_FILE_PATH}`)
            if (fs.existsSync(CONFIG_FILE_PATH)) {
              const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf-8'))
              console.log(`[/config] Loaded config from file: tools=${fileConfig.tools?.length ?? 0}, webhooks=${fileConfig.webhooks?.length ?? 0}`)
              return createResponse(200, fileConfig, headers)
            }
            console.log('[/config] Config file not found, falling back to runtime serialization')
          } catch (err) {
            console.warn('[/config] Failed to read config file, falling back to runtime serialization:', err)
          }
          // Fallback to runtime serialization (for local dev without build)
          const serialized = serializeConfig(config)
          console.log(`[/config] Runtime serialization: tools=${serialized.tools?.length ?? 0}, webhooks=${serialized.webhooks?.length ?? 0}`)
          return createResponse(200, serialized, headers)
        }

        if (path === '/mcp' && method === 'POST') {
          let body: any

          try {
            body = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              {
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32700,
                  message: 'Parse error',
                },
              },
              headers,
            )
          }

          try {
            const { jsonrpc, id, method: rpcMethod, params } = body

            if (jsonrpc !== '2.0') {
              return createResponse(
                400,
                {
                  jsonrpc: '2.0',
                  id,
                  error: {
                    code: -32600,
                    message: 'Invalid Request',
                  },
                },
                headers,
              )
            }

            let result: unknown

            if (rpcMethod === 'tools/list') {
              result = { tools }
            } else if (rpcMethod === 'tools/call') {
              const toolName = params?.name as string
              // Support both formats:
              // 1. Skedyul format: { inputs: {...}, context: {...}, env: {...}, invocation: {...} }
              // 2. Standard MCP format: { ...directArgs }
              const rawArgs = (params?.arguments ?? {}) as Record<string, unknown>
              
              // Debug: Log incoming tools/call request to trace env passthrough
              console.log('[serverless.ts /mcp] Received tools/call request:', JSON.stringify({
                toolName,
                hasArguments: !!params?.arguments,
                argumentKeys: rawArgs ? Object.keys(rawArgs) : [],
                hasEnv: 'env' in rawArgs,
                envKeys: rawArgs.env ? Object.keys(rawArgs.env as Record<string, unknown>) : [],
                hasApiToken: !!(rawArgs.env as Record<string, unknown>)?.SKEDYUL_API_TOKEN,
              }, null, 2))
              
              const hasSkedyulFormat = 'inputs' in rawArgs || 'env' in rawArgs || 'context' in rawArgs || 'invocation' in rawArgs
              const toolInputs = hasSkedyulFormat ? (rawArgs.inputs ?? {}) : rawArgs
              const toolContext = hasSkedyulFormat ? (rawArgs.context as Record<string, unknown> | undefined) : undefined
              const toolEnv = hasSkedyulFormat ? (rawArgs.env as Record<string, string> | undefined) : undefined
              const toolInvocation = hasSkedyulFormat ? (rawArgs.invocation as InvocationContext | undefined) : undefined
              
              // Debug: Log extracted env
              console.log('[serverless.ts /mcp] Extracted env:', JSON.stringify({
                hasSkedyulFormat,
                hasToolEnv: !!toolEnv,
                toolEnvKeys: toolEnv ? Object.keys(toolEnv) : [],
                hasApiToken: toolEnv?.SKEDYUL_API_TOKEN ? `yes (${toolEnv.SKEDYUL_API_TOKEN.length} chars)` : 'no',
              }, null, 2))

              // Find tool by name (check both registry key and tool.name)
              let toolKey: string | null = null
              let tool: ToolRegistryEntry | null = null

              for (const [key, t] of Object.entries(registry)) {
                if (t.name === toolName || key === toolName) {
                  toolKey = key
                  tool = t
                  break
                }
              }

              if (!tool || !toolKey) {
                return createResponse(
                  200,
                  {
                    jsonrpc: '2.0',
                    id,
                    error: {
                      code: -32602,
                      message: `Tool "${toolName}" not found`,
                    },
                  },
                  headers,
                )
              }

              try {
                const inputSchema = getZodSchema(tool.inputSchema)
                const outputSchema = getZodSchema(tool.outputSchema)
                const hasOutputSchema = Boolean(outputSchema)
                const validatedInputs = inputSchema
                  ? inputSchema.parse(toolInputs)
                  : toolInputs
                const toolResult = await callTool(toolKey, {
                  inputs: validatedInputs,
                  context: toolContext,
                  env: toolEnv,
                  invocation: toolInvocation,
                })

                // Transform internal format to MCP protocol format
                // Note: effect is embedded in structuredContent as __effect
                // for consistency with dedicated mode (MCP SDK strips custom fields)
                if (toolResult.error) {
                  const errorOutput = { error: toolResult.error }
                  result = {
                    content: [{ type: 'text', text: JSON.stringify(errorOutput) }],
                    // Don't provide structuredContent for error responses when tool has outputSchema
                    // because the error response won't match the success schema and MCP SDK validates it
                    structuredContent: hasOutputSchema ? undefined : errorOutput,
                    isError: true,
                    billing: toolResult.billing,
                  }
                } else {
                  const outputData = toolResult.output as Record<string, unknown> | null
                  // MCP SDK requires structuredContent when outputSchema is defined
                  // Always provide it (even as empty object) to satisfy validation
                  let structuredContent: Record<string, unknown> | undefined
                  if (outputData) {
                    structuredContent = { ...outputData, __effect: toolResult.effect }
                  } else if (toolResult.effect) {
                    structuredContent = { __effect: toolResult.effect }
                  } else if (hasOutputSchema) {
                    // Tool has outputSchema but returned null/undefined output
                    // Provide empty object to satisfy MCP SDK validation
                    structuredContent = {}
                  }
                  result = {
                    content: [{ type: 'text', text: JSON.stringify(toolResult.output) }],
                    structuredContent,
                    billing: toolResult.billing,
                  }
                }
              } catch (validationError) {
                return createResponse(
                  200,
                  {
                    jsonrpc: '2.0',
                    id,
                    error: {
                      code: -32602,
                      message:
                        validationError instanceof Error
                          ? validationError.message
                          : 'Invalid arguments',
                    },
                  },
                  headers,
                )
              }
            } else if (rpcMethod === 'webhooks/list') {
              // Return registered webhooks with their metadata
              const webhooks = webhookRegistry
                ? Object.values(webhookRegistry).map((w) => ({
                    name: w.name,
                    description: w.description,
                    methods: w.methods ?? ['POST'],
                    type: w.type ?? 'WEBHOOK',
                  }))
                : []
              result = { webhooks }
            } else {
              return createResponse(
                200,
                {
                  jsonrpc: '2.0',
                  id,
                  error: {
                    code: -32601,
                    message: `Method not found: ${rpcMethod}`,
                  },
                },
                headers,
              )
            }

            return createResponse(
              200,
              {
                jsonrpc: '2.0',
                id,
                result,
              },
              headers,
            )
          } catch (err) {
            return createResponse(
              500,
              {
                jsonrpc: '2.0',
                id: body?.id ?? null,
                error: {
                  code: -32603,
                  message: err instanceof Error ? err.message : String(err ?? ''),
                },
              },
              headers,
            )
          }
        }

        return createResponse(
          404,
          {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32601,
              message: 'Not Found',
            },
          },
          headers,
        )
      } catch (err) {
        return createResponse(
          500,
          {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : String(err ?? ''),
            },
          },
          headers,
        )
      }
    },
    getHealthStatus: () => state.getHealthStatus(),
  }
}
