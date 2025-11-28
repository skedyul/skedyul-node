import http, { IncomingMessage, ServerResponse } from 'http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as z from 'zod'

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  BillingInfo,
  CorsOptions,
  HealthStatus,
  SkedyulServerConfig,
  SkedyulServerInstance,
  ToolCallResponse,
  ToolMetadata,
  ToolName,
  ToolRegistry,
} from './types'
import { coreApiService } from './core/service'
import type { CommunicationChannel, Message, WebhookRequest } from './core/types'

type ToolCallArgs = {
  env?: Record<string, string | undefined>
  inputs?: Record<string, unknown>
  estimate?: boolean
}

interface RequestState {
  incrementRequestCount(): void
  shouldShutdown(): boolean
  getHealthStatus(): HealthStatus
}

function normalizeBilling(billing?: BillingInfo): BillingInfo {
  if (!billing || typeof billing.credits !== 'number') {
    return { credits: 0 }
  }
  return billing
}

function parseJsonRecord(value?: string): Record<string, string> {
  if (!value) {
    return {}
  }
  try {
    return JSON.parse(value) as Record<string, string>
  } catch {
    return {}
  }
}

function parseNumberEnv(value?: string): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function mergeRuntimeEnv(): void {
  const bakedEnv = parseJsonRecord(process.env.MCP_ENV_JSON)
  const runtimeEnv = parseJsonRecord(process.env.MCP_ENV)
  const merged = { ...bakedEnv, ...runtimeEnv }
  Object.assign(process.env, merged)
}

type CoreMethod =
  | 'createCommunicationChannel'
  | 'updateCommunicationChannel'
  | 'deleteCommunicationChannel'
  | 'getCommunicationChannel'
  | 'getCommunicationChannels'
  | 'communicationChannel.list'
  | 'communicationChannel.get'
  | 'workplace.list'
  | 'workplace.get'
  | 'sendMessage'

async function handleCoreMethod(
  method: CoreMethod,
  params: Record<string, unknown> | undefined,
): Promise<{ status: number; payload: unknown }> {
  const service = coreApiService.getService()
  if (!service) {
    return {
      status: 404,
      payload: { error: 'Core API service not configured' },
    }
  }

  if (method === 'createCommunicationChannel') {
    if (!params?.channel) {
      return { status: 400, payload: { error: 'channel is required' } }
    }
    const channel = params.channel as CommunicationChannel
    const result = await coreApiService.callCreateChannel(channel)
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'updateCommunicationChannel') {
    if (!params?.channel) {
      return { status: 400, payload: { error: 'channel is required' } }
    }
    const channel = params.channel as CommunicationChannel
    const result = await coreApiService.callUpdateChannel(channel)
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'deleteCommunicationChannel') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callDeleteChannel(params.id as string)
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'getCommunicationChannel') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callGetChannel(params.id as string)
    if (!result) {
      return {
        status: 404,
        payload: { error: 'Channel not found' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'getCommunicationChannels') {
    const result = await coreApiService.callListChannels()
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'communicationChannel.list') {
    const result = await coreApiService.callListChannels()
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'communicationChannel.get') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callGetChannel(params.id as string)
    if (!result) {
      return {
        status: 404,
        payload: { error: 'Channel not found' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'workplace.list') {
    const result = await coreApiService.callListWorkplaces()
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'workplace.get') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callGetWorkplace(params.id as string)
    if (!result) {
      return {
        status: 404,
        payload: { error: 'Workplace not found' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'sendMessage') {
    if (!params?.message || !params?.communicationChannel) {
      return { status: 400, payload: { error: 'message and communicationChannel are required' } }
    }
    const msg = params.message as Message
    const channel = params.communicationChannel as CommunicationChannel
    const result = await coreApiService.callSendMessage({
      message: msg,
      communicationChannel: channel,
    })
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  return {
    status: 400,
    payload: { error: 'Unknown core method' },
  }
}

function buildToolMetadata(registry: ToolRegistry): ToolMetadata[] {
  return Object.values(registry).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: {
        inputs: {
          type: 'object',
          description: 'Input parameters for the function',
        },
      },
      required: ['inputs'],
    },
  }))
}

function createRequestState(
  maxRequests: number | null,
  ttlExtendSeconds: number,
  runtimeLabel: string,
  toolNames: string[],
): RequestState {
  let requestCount = 0
  let lastRequestTime = Date.now()

  return {
    incrementRequestCount() {
      requestCount += 1
      lastRequestTime = Date.now()
    },
    shouldShutdown() {
      return maxRequests !== null && requestCount >= maxRequests
    },
    getHealthStatus() {
      return {
        status: 'running',
        requests: requestCount,
        maxRequests,
        requestsRemaining:
          maxRequests !== null ? Math.max(0, maxRequests - requestCount) : null,
        lastRequestTime,
        ttlExtendSeconds,
        runtime: runtimeLabel,
        tools: [...toolNames],
      }
    },
  }
}

function createCallToolHandler<T extends ToolRegistry>(
  registry: T,
  state: RequestState,
  onMaxRequests?: () => void,
) {
  return async function callTool(
    nameRaw: unknown,
    argsRaw: unknown,
  ): Promise<ToolCallResponse> {
    const toolName = String(nameRaw) as ToolName<T>
    const tool = registry[toolName]

    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in registry`)
    }

    if (!tool.handler || typeof tool.handler !== 'function') {
      throw new Error(`Tool "${toolName}" handler is not a function`)
    }

    const fn = tool.handler

    const args = (argsRaw ?? {}) as ToolCallArgs
    const estimateMode = args.estimate === true
    if (!estimateMode) {
      state.incrementRequestCount()
      if (state.shouldShutdown()) {
        onMaxRequests?.()
      }
    }

    const requestEnv = args.env ?? {}
    const originalEnv = { ...process.env }
    Object.assign(process.env, requestEnv)

    try {
      const inputs = args.inputs ?? {}
      const functionResult = await fn({
        input: inputs,
        context: {
          env: process.env,
          mode: estimateMode ? 'estimate' : 'execute',
        },
      } as never)

      const billing = normalizeBilling(functionResult.billing)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(functionResult.output),
          },
        ],
        billing,
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error ?? ''),
            }),
          },
        ],
        billing: { credits: 0 },
        isError: true,
      }
    } finally {
      process.env = originalEnv
    }
  }
}

function parseJSONBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })

    req.on('error', reject)
  })
}

function sendJSON(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function getDefaultHeaders(options?: CorsOptions): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': options?.allowOrigin ?? '*',
    'Access-Control-Allow-Methods':
      options?.allowMethods ?? 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      options?.allowHeaders ?? 'Content-Type',
  }
}

function createResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  }
}

function getListeningPort(config: SkedyulServerConfig): number {
  const envPort = Number.parseInt(process.env.PORT ?? '', 10)
  if (!Number.isNaN(envPort)) {
    return envPort
  }

  return config.defaultPort ?? 3000
}

export function createSkedyulServer(
  config: SkedyulServerConfig,
  registry: ToolRegistry,
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

    mcpServer.registerTool(
      toolName,
      {
        title: toolName,
        description: tool.description,
        inputSchema: tool.inputs,
        outputSchema: tool.outputSchema,
      },
      async (args: any) => {
        // Args will be the parsed Zod schema values directly
        const result = await callTool(toolKey, {
          inputs: args,
        })
        return {
          content: result.content,
          structuredContent: result.isError
            ? undefined
            : JSON.parse(result.content[0]?.text ?? '{}'),
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

  return createServerlessInstance(config, tools, callTool, state, mcpServer, registry)
}

function createDedicatedServerInstance(
  config: SkedyulServerConfig,
  tools: ToolMetadata[],
  callTool: (nameRaw: unknown, argsRaw: unknown) => Promise<ToolCallResponse>,
  state: RequestState,
  mcpServer: McpServer,
): SkedyulServerInstance {
  const port = getListeningPort(config)
  const httpServer = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      function sendCoreResult(result: { status: number; payload: unknown }) {
        sendJSON(res, result.status, result.payload)
      }

    try {
      const url = new URL(
        req.url || '/',
        `http://${req.headers.host || 'localhost'}`,
      )
      const pathname = url.pathname

      if (pathname === '/health' && req.method === 'GET') {
        sendJSON(res, 200, state.getHealthStatus())
        return
      }

      if (pathname === '/estimate' && req.method === 'POST') {
        let estimateBody: any

        try {
          estimateBody = (await parseJSONBody(req)) as {
            name?: unknown
            inputs?: Record<string, unknown>
          }
        } catch {
          sendJSON(res, 400, {
            error: {
              code: -32700,
              message: 'Parse error',
            },
          })
          return
        }

        try {
          const estimateResponse = await callTool(estimateBody.name, {
            inputs: estimateBody.inputs,
            estimate: true,
          })

          sendJSON(res, 200, {
            billing: estimateResponse.billing ?? { credits: 0 },
          })
        } catch (err) {
          sendJSON(res, 500, {
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : String(err ?? ''),
            },
          })
        }

        return
      }

        if (pathname === '/core' && req.method === 'POST') {
          let coreBody: any

          try {
            coreBody = (await parseJSONBody(req)) as {
              method?: CoreMethod
              params?: Record<string, unknown>
            }
          } catch {
            sendJSON(res, 400, {
              error: {
                code: -32700,
                message: 'Parse error',
              },
            })
            return
          }

          if (!coreBody?.method) {
            sendJSON(res, 400, {
              error: {
                code: -32602,
                message: 'Missing method',
              },
            })
            return
          }

          const method = coreBody.method as CoreMethod
          const result = await handleCoreMethod(method, coreBody.params)
          sendCoreResult(result)
          return
        }

        if (pathname === '/core/webhook' && req.method === 'POST') {
          let webhookBody: unknown = undefined

          try {
            webhookBody = (await parseJSONBody(req))
          } catch {
            sendJSON(res, 400, { status: 'parse-error' })
            return
          }

          const webhookRequest: WebhookRequest = {
            method: req.method,
            headers: Object.fromEntries(
              Object.entries(req.headers).map(([key, value]) => [
                key,
                typeof value === 'string' ? value : value?.[0] ?? '',
              ]),
            ),
            body: webhookBody,
            query: Object.fromEntries(url.searchParams.entries()),
          }

          const webhookResponse = await coreApiService.dispatchWebhook(
            webhookRequest,
          )

          res.writeHead(webhookResponse.status, {
            'Content-Type': 'application/json',
          })
          res.end(JSON.stringify(webhookResponse.body ?? {}))
          return
        }

      if (pathname === '/mcp' && req.method === 'POST') {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
          })

        res.on('close', () => {
          transport.close()
        })

        try {
          const body = await parseJSONBody(req)
          await mcpServer.connect(transport)
          await transport.handleRequest(req, res, body)
        } catch (err) {
          sendJSON(res, 500, {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : String(err ?? ''),
            },
          })
        }

        return
      }

      sendJSON(res, 404, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32601,
          message: 'Not Found',
        },
      })
    } catch (err) {
      sendJSON(res, 500, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err ?? ''),
        },
      })
    }
  })

  return {
    async listen(listenPort?: number) {
      const finalPort = listenPort ?? port
      return new Promise<void>((resolve, reject) => {
        httpServer.listen(finalPort, () => {
          // eslint-disable-next-line no-console
          console.log(`MCP Server running on port ${finalPort}`)
          // eslint-disable-next-line no-console
          console.log(
            `Registry loaded with ${tools.length} tools: ${tools
              .map((tool) => tool.name)
              .join(', ')}`,
          )
          resolve()
        })

        httpServer.once('error', reject)
      })
    },
    getHealthStatus: () => state.getHealthStatus(),
  }
}

function createServerlessInstance(
  config: SkedyulServerConfig,
  tools: ToolMetadata[],
  callTool: (nameRaw: unknown, argsRaw: unknown) => Promise<ToolCallResponse>,
  state: RequestState,
  mcpServer: McpServer,
  registry: ToolRegistry,
): SkedyulServerInstance {
  const headers = getDefaultHeaders(config.cors)

  return {
    async handler(event: APIGatewayProxyEvent) {
      try {
        const path = event.path
        const method = event.httpMethod

        if (method === 'OPTIONS') {
          return createResponse(200, { message: 'OK' }, headers)
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

          const method = coreBody.method as CoreMethod
          const result = await handleCoreMethod(method, coreBody.params)
          return createResponse(result.status, result.payload, headers)
        }

        if (path === '/core/webhook' && method === 'POST') {
          let webhookBody: unknown = undefined

          try {
            webhookBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              { status: 'parse-error' },
              headers,
            )
          }

          const webhookRequest: WebhookRequest = {
            method,
            headers: event.headers ?? {},
            body: webhookBody,
            query: event.queryStringParameters ?? {},
          }

          const webhookResponse = await coreApiService.dispatchWebhook(
            webhookRequest,
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
            let tool = null

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

            // Validate arguments against Zod schema
            const validatedArgs = tool.inputs.parse(toolArgs)
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

        if (path === '/health' && method === 'GET') {
          return createResponse(200, state.getHealthStatus(), headers)
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
              const toolArgs = params?.arguments ?? {}

              // Find tool by name (check both registry key and tool.name)
              let toolKey: string | null = null
              let tool = null

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

              // Validate arguments against Zod schema
              try {
                const validatedArgs = tool.inputs.parse(toolArgs)
                result = await callTool(toolKey, {
                  inputs: validatedArgs,
                })
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

export const server = {
  create: createSkedyulServer,
}

