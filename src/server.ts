import http, { IncomingMessage, ServerResponse } from 'http'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as z from 'zod'

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  BillingInfo,
  CorsOptions,
  DedicatedServerInstance,
  HealthStatus,
  ServerlessServerInstance,
  SkedyulServerConfig,
  SkedyulServerInstance,
  ToolCallResponse,
  ToolMetadata,
  ToolName,
  ToolRegistry,
  ToolSchema,
  ToolSchemaWithJson,
  WebhookRegistry,
  WebhookContext,
} from './types'
import type { WebhookResponse, ToolExecutionContext, ToolTrigger, WebhookRequest } from './types'
import { coreApiService } from './core/service'
import { runWithConfig } from './core/client'
import type { CommunicationChannel, Message, WebhookRequest as CoreWebhookRequest } from './core/types'

type ToolCallArgs = {
  env?: Record<string, string | undefined>
  inputs?: Record<string, unknown>
  context?: Record<string, unknown>
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

function toJsonSchema(schema?: z.ZodTypeAny): Record<string, unknown> | undefined {
  if (!schema) return undefined
  try {
    // Zod v4 has native JSON Schema support via z.toJSONSchema()
    return z.toJSONSchema(schema, {
      unrepresentable: 'any', // Handle z.date(), z.bigint() etc gracefully
    }) as Record<string, unknown>
  } catch (err) {
    console.error('[toJsonSchema] Failed to convert schema:', err)
    return undefined
  }
}

function isToolSchemaWithJson(
  schema: ToolSchema | undefined,
): schema is ToolSchemaWithJson {
  return Boolean(
    schema &&
      typeof schema === 'object' &&
      'zod' in schema &&
      schema.zod instanceof z.ZodType,
  )
}

function getZodSchema(schema?: ToolSchema): z.ZodTypeAny | undefined {
  if (!schema) return undefined
  if (schema instanceof z.ZodType) {
    return schema
  }
  if (isToolSchemaWithJson(schema)) {
    return schema.zod
  }
  return undefined
}

function getJsonSchemaFromToolSchema(
  schema?: ToolSchema,
): Record<string, unknown> | undefined {
  if (!schema) return undefined

  if (isToolSchemaWithJson(schema) && schema.jsonSchema) {
    return schema.jsonSchema
  }

  const zodSchema = getZodSchema(schema)
  return toJsonSchema(zodSchema)
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
    inputSchema: getJsonSchemaFromToolSchema(tool.inputs),
    outputSchema: getJsonSchemaFromToolSchema(tool.outputSchema),
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
      // Get tool inputs (clean, no context)
      const inputs = (args.inputs ?? {}) as Record<string, unknown>

      // Get context from args.context (separate from inputs)
      const rawContext = (args.context ?? {}) as Record<string, unknown>

      // Debug logging for tool handler
      console.log('\n🔧 callTool processing:')
      console.log('   Full args received:', JSON.stringify(args, null, 2))
      console.log('   args.context:', JSON.stringify(args.context, null, 2))
      console.log('   rawContext:', JSON.stringify(rawContext, null, 2))

      // Extract app info (required for all contexts)
      const app = rawContext.app as { id: string; versionId: string }

      // Determine trigger type from context
      const trigger = (rawContext.trigger as ToolTrigger) || 'agent'

      // Build execution context based on trigger type
      let executionContext: ToolExecutionContext

      if (trigger === 'provision') {
        // Provision context - no installation, no workplace
        executionContext = {
          trigger: 'provision',
          app,
          env: process.env as Record<string, string | undefined>,
          mode: estimateMode ? 'estimate' : 'execute',
        }
      } else {
        // Runtime context - has installation, workplace, request
        const workplace = rawContext.workplace as { id: string; subdomain: string }
        const request = rawContext.request as { url: string; params: Record<string, string>; query: Record<string, string> }
        const appInstallationId = rawContext.appInstallationId as string
        const envVars = process.env as Record<string, string | undefined>
        const modeValue: 'execute' | 'estimate' = estimateMode ? 'estimate' : 'execute'

        if (trigger === 'field_change') {
          const field = rawContext.field as { handle: string; type: string; pageHandle: string; value: unknown; previousValue?: unknown }
          executionContext = { trigger: 'field_change', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, field }
        } else if (trigger === 'page_action') {
          const page = rawContext.page as { handle: string; values: Record<string, unknown> }
          executionContext = { trigger: 'page_action', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, page }
        } else if (trigger === 'form_submit') {
          const form = rawContext.form as { handle: string; values: Record<string, unknown> }
          executionContext = { trigger: 'form_submit', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, form }
        } else if (trigger === 'workflow') {
          executionContext = { trigger: 'workflow', app, appInstallationId, workplace, request, env: envVars, mode: modeValue }
        } else {
          // Default to agent
          executionContext = { trigger: 'agent', app, appInstallationId, workplace, request, env: envVars, mode: modeValue }
        }
      }

      console.log('   Built executionContext:', JSON.stringify({
        trigger: executionContext.trigger,
        app: executionContext.app,
        appInstallationId: 'appInstallationId' in executionContext ? executionContext.appInstallationId : undefined,
        workplace: 'workplace' in executionContext ? executionContext.workplace : undefined,
        request: 'request' in executionContext ? executionContext.request : undefined,
        mode: executionContext.mode,
      }, null, 2))

      // Build request-scoped config from env passed in MCP call
      const requestConfig = {
        baseUrl: requestEnv.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
        apiToken: requestEnv.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
      }

      console.log('   Request config:', JSON.stringify({
        baseUrl: requestConfig.baseUrl ? '(set)' : '(empty)',
        apiToken: requestConfig.apiToken ? '(set)' : '(empty)',
      }, null, 2))

      // Call handler with two arguments: (input, context)
      // Wrap in runWithConfig for request-scoped SDK configuration
      const functionResult = await runWithConfig(requestConfig, async () => {
        return await fn(inputs as never, executionContext as never)
      })

      const billing = normalizeBilling(functionResult.billing)

      return {
        output: functionResult.output,
        billing,
        effect: functionResult.effect,
      }
    } catch (error) {
      return {
        output: null,
        billing: { credits: 0 },
        error: error instanceof Error ? error.message : String(error ?? ''),
      }
    } finally {
      process.env = originalEnv
    }
  }
}

function readRawRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      resolve(body)
    })

    req.on('error', reject)
  })
}

async function parseJSONBody(req: IncomingMessage): Promise<unknown> {
  const rawBody = await readRawRequestBody(req)
  try {
    return rawBody ? JSON.parse(rawBody) : {}
  } catch (err) {
    throw err
  }
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

/**
 * Prints a styled startup log showing server configuration
 */
function printStartupLog(
  config: SkedyulServerConfig,
  tools: ToolMetadata[],
  webhookRegistry?: WebhookRegistry,
  port?: number,
): void {
  const webhookCount = webhookRegistry ? Object.keys(webhookRegistry).length : 0
  const webhookNames = webhookRegistry ? Object.keys(webhookRegistry) : []
  const maxRequests =
    config.maxRequests ??
    parseNumberEnv(process.env.MCP_MAX_REQUESTS) ??
    null
  const ttlExtendSeconds =
    config.ttlExtendSeconds ??
    parseNumberEnv(process.env.MCP_TTL_EXTEND) ??
    3600
  const executableId = process.env.SKEDYUL_EXECUTABLE_ID || 'local'

  const divider = '═'.repeat(70)
  const thinDivider = '─'.repeat(70)

  // eslint-disable-next-line no-console
  console.log('')
  // eslint-disable-next-line no-console
  console.log(`╔${divider}╗`)
  // eslint-disable-next-line no-console
  console.log(`║  🚀 Skedyul MCP Server Starting                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╠${divider}╣`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`║  📦 Server:       ${padEnd(config.metadata.name, 49)}║`)
  // eslint-disable-next-line no-console
  console.log(`║  🏷️  Version:      ${padEnd(config.metadata.version, 49)}║`)
  // eslint-disable-next-line no-console
  console.log(`║  ⚡ Compute:      ${padEnd(config.computeLayer, 49)}║`)
  if (port) {
    // eslint-disable-next-line no-console
    console.log(`║  🌐 Port:         ${padEnd(String(port), 49)}║`)
  }
  // eslint-disable-next-line no-console
  console.log(`║  🔑 Executable:   ${padEnd(executableId, 49)}║`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╟${thinDivider}╢`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`║  🔧 Tools (${tools.length}):                                                       ║`)

  // List tools (max 10, then show "and X more...")
  const maxToolsToShow = 10
  const toolsToShow = tools.slice(0, maxToolsToShow)
  for (const tool of toolsToShow) {
    // eslint-disable-next-line no-console
    console.log(`║     • ${padEnd(tool.name, 61)}║`)
  }
  if (tools.length > maxToolsToShow) {
    // eslint-disable-next-line no-console
    console.log(`║     ... and ${tools.length - maxToolsToShow} more                                              ║`)
  }

  if (webhookCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`║                                                                      ║`)
    // eslint-disable-next-line no-console
    console.log(`║  🪝 Webhooks (${webhookCount}):                                                     ║`)
    const maxWebhooksToShow = 5
    const webhooksToShow = webhookNames.slice(0, maxWebhooksToShow)
    for (const name of webhooksToShow) {
      // eslint-disable-next-line no-console
      console.log(`║     • /webhooks/${padEnd(name, 51)}║`)
    }
    if (webhookCount > maxWebhooksToShow) {
      // eslint-disable-next-line no-console
      console.log(`║     ... and ${webhookCount - maxWebhooksToShow} more                                              ║`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╟${thinDivider}╢`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`║  ⚙️  Configuration:                                                   ║`)
  // eslint-disable-next-line no-console
  console.log(`║     Max Requests:    ${padEnd(maxRequests !== null ? String(maxRequests) : 'unlimited', 46)}║`)
  // eslint-disable-next-line no-console
  console.log(`║     TTL Extend:      ${padEnd(`${ttlExtendSeconds}s`, 46)}║`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╟${thinDivider}╢`)
  // eslint-disable-next-line no-console
  console.log(`║  ✅ Ready at ${padEnd(new Date().toISOString(), 55)}║`)
  // eslint-disable-next-line no-console
  console.log(`╚${divider}╝`)
  // eslint-disable-next-line no-console
  console.log('')
}

/**
 * Pad a string to the right with spaces
 */
function padEnd(str: string, length: number): string {
  if (str.length >= length) {
    return str.slice(0, length)
  }
  return str + ' '.repeat(length - str.length)
}

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
    const inputZodSchema = getZodSchema(tool.inputs)
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
        title: toolName,
        description: tool.description,
        inputSchema: wrappedInputSchema,
        outputSchema: outputZodSchema,
      },
      async (args: unknown) => {
        // Args are in Skedyul format: { inputs: {...}, context: {...}, env: {...} }
        const rawArgs = args as Record<string, unknown>
        const toolInputs = (rawArgs.inputs ?? {}) as Record<string, unknown>
        const toolContext = rawArgs.context as Record<string, unknown> | undefined
        const toolEnv = rawArgs.env as Record<string, string> | undefined

        // Debug logging for MCP SDK tool calls
        console.log('\n📞 MCP SDK registerTool handler:')
        console.log('   Tool:', toolName)
        console.log('   Raw args:', JSON.stringify(rawArgs, null, 2))
        console.log('   Extracted context:', JSON.stringify(toolContext, null, 2))

        const validatedInputs = inputZodSchema ? inputZodSchema.parse(toolInputs) : toolInputs
        const result = await callTool(toolKey, {
          inputs: validatedInputs,
          context: toolContext,
          env: toolEnv,
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

function createDedicatedServerInstance(
  config: SkedyulServerConfig,
  tools: ToolMetadata[],
  callTool: (nameRaw: unknown, argsRaw: unknown) => Promise<ToolCallResponse>,
  state: RequestState,
  mcpServer: McpServer,
  webhookRegistry?: WebhookRegistry,
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

      // Handle webhook requests: /webhooks/{handle}
      if (pathname.startsWith('/webhooks/') && webhookRegistry) {
        const handle = pathname.slice('/webhooks/'.length)
        const webhookDef = webhookRegistry[handle]

        if (!webhookDef) {
          sendJSON(res, 404, { error: `Webhook handler '${handle}' not found` })
          return
        }

        // Check if HTTP method is allowed
        const allowedMethods = webhookDef.methods ?? ['POST']
        if (!allowedMethods.includes(req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')) {
          sendJSON(res, 405, { error: `Method ${req.method} not allowed` })
          return
        }

        // Read raw request body
        let rawBody: string
        try {
          rawBody = await readRawRequestBody(req)
        } catch {
          sendJSON(res, 400, { error: 'Failed to read request body' })
          return
        }

        // Parse body based on content type
        let parsedBody: unknown
        const contentType = req.headers['content-type'] ?? ''
        if (contentType.includes('application/json')) {
          try {
            parsedBody = rawBody ? JSON.parse(rawBody) : {}
          } catch {
            parsedBody = rawBody
          }
        } else {
          parsedBody = rawBody
        }

        // Check if this is an envelope format from the platform
        // Envelope format: { env: {...}, request: {...}, context: {...} }
        const isEnvelope = (
          typeof parsedBody === 'object' &&
          parsedBody !== null &&
          'env' in parsedBody &&
          'request' in parsedBody &&
          'context' in parsedBody
        )

        let webhookRequest: WebhookRequest
        let webhookContext: WebhookContext
        let requestEnv: Record<string, string> = {}

        if (isEnvelope) {
          // Platform envelope format - extract env, request, and context
          const envelope = parsedBody as {
            env: Record<string, string>
            request: {
              method: string
              url: string
              path: string
              headers: Record<string, string>
              query: Record<string, string>
              body: string
            }
            context: {
              app: { id: string; versionId: string }
              appInstallationId: string | null
              workplace: { id: string; subdomain: string } | null
              registration: Record<string, unknown> | null
            }
          }

          requestEnv = envelope.env ?? {}

          // Parse the original request body
          let originalParsedBody: unknown = envelope.request.body
          const originalContentType = envelope.request.headers['content-type'] ?? ''
          if (originalContentType.includes('application/json')) {
            try {
              originalParsedBody = envelope.request.body ? JSON.parse(envelope.request.body) : {}
            } catch {
              // Keep as string if JSON parsing fails
            }
          }

          webhookRequest = {
            method: envelope.request.method,
            url: envelope.request.url,
            path: envelope.request.path,
            headers: envelope.request.headers as Record<string, string | string[] | undefined>,
            query: envelope.request.query,
            body: originalParsedBody,
            rawBody: envelope.request.body ? Buffer.from(envelope.request.body, 'utf-8') : undefined,
          }

          const envVars = { ...process.env, ...requestEnv } as Record<string, string | undefined>
          const app = envelope.context.app

          // Build webhook context based on whether we have installation context
          if (envelope.context.appInstallationId && envelope.context.workplace) {
            // Runtime webhook context
            webhookContext = {
              env: envVars,
              app,
              appInstallationId: envelope.context.appInstallationId,
              workplace: envelope.context.workplace,
              registration: envelope.context.registration ?? {},
            }
          } else {
            // Provision webhook context
            webhookContext = {
              env: envVars,
              app,
            }
          }
        } else {
          // Direct request format (legacy or direct calls) - requires app info from headers or fail
          const appId = req.headers['x-skedyul-app-id'] as string | undefined
          const appVersionId = req.headers['x-skedyul-app-version-id'] as string | undefined
          
          if (!appId || !appVersionId) {
            throw new Error('Missing app info in webhook request (x-skedyul-app-id and x-skedyul-app-version-id headers required)')
          }

          webhookRequest = {
            method: req.method ?? 'POST',
            url: url.toString(),
            path: pathname,
            headers: req.headers as Record<string, string | string[] | undefined>,
            query: Object.fromEntries(url.searchParams.entries()),
            body: parsedBody,
            rawBody: rawBody ? Buffer.from(rawBody, 'utf-8') : undefined,
          }

          // Direct calls are provision-level (no installation context)
          webhookContext = {
            env: process.env as Record<string, string | undefined>,
            app: { id: appId, versionId: appVersionId },
          }
        }

        // Temporarily inject env into process.env for skedyul client to use
        // (same pattern as tool handler)
        const originalEnv = { ...process.env }
        Object.assign(process.env, requestEnv)

        // Build request-scoped config for the skedyul client
        // This uses AsyncLocalStorage to override the global config (same pattern as tools)
        const requestConfig = {
          baseUrl: requestEnv.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
          apiToken: requestEnv.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
        }

        // Invoke the handler with request-scoped config
        let webhookResponse: WebhookResponse
        try {
          webhookResponse = await runWithConfig(requestConfig, async () => {
            return await webhookDef.handler(webhookRequest, webhookContext)
          })
        } catch (err) {
          console.error(`Webhook handler '${handle}' error:`, err)
          sendJSON(res, 500, { error: 'Webhook handler error' })
          return
        } finally {
          // Restore original env
          process.env = originalEnv
        }

        // Send response
        const status = webhookResponse.status ?? 200
        const responseHeaders: Record<string, string> = {
          ...webhookResponse.headers,
        }

        // Default to JSON content type if not specified
        if (!responseHeaders['Content-Type'] && !responseHeaders['content-type']) {
          responseHeaders['Content-Type'] = 'application/json'
        }

        res.writeHead(status, responseHeaders)

        if (webhookResponse.body !== undefined) {
          if (typeof webhookResponse.body === 'string') {
            res.end(webhookResponse.body)
          } else {
            res.end(JSON.stringify(webhookResponse.body))
          }
        } else {
          res.end()
        }
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
          let rawWebhookBody: string

          try {
            rawWebhookBody = await readRawRequestBody(req)
          } catch {
            sendJSON(res, 400, { status: 'parse-error' })
            return
          }

          let webhookBody: unknown
          try {
            webhookBody = rawWebhookBody ? JSON.parse(rawWebhookBody) : {}
          } catch {
            sendJSON(res, 400, { status: 'parse-error' })
            return
          }

          const normalizedHeaders = Object.fromEntries(
            Object.entries(req.headers).map(([key, value]) => [
              key,
              typeof value === 'string' ? value : value?.[0] ?? '',
            ]),
          )

          const coreWebhookRequest: CoreWebhookRequest = {
            method: req.method ?? 'POST',
            headers: normalizedHeaders,
            body: webhookBody,
            query: Object.fromEntries(url.searchParams.entries()),
            url: url.toString(),
            path: url.pathname,
            rawBody: rawWebhookBody
              ? Buffer.from(rawWebhookBody, 'utf-8')
              : undefined,
          }

          const webhookResponse = await coreApiService.dispatchWebhook(
            coreWebhookRequest,
          )

          res.writeHead(webhookResponse.status, {
            'Content-Type': 'application/json',
          })
          res.end(JSON.stringify(webhookResponse.body ?? {}))
          return
        }

      if (pathname === '/mcp' && req.method === 'POST') {
        try {
          const body = await parseJSONBody(req) as { jsonrpc?: string; id?: unknown; method?: string }

          // Handle webhooks/list before passing to MCP SDK transport
          if (body?.method === 'webhooks/list') {
            const webhooks = webhookRegistry
              ? Object.values(webhookRegistry).map((w) => ({
                  name: w.name,
                  description: w.description,
                  methods: w.methods ?? ['POST'],
                  type: w.type ?? 'WEBHOOK',
                }))
              : []
            sendJSON(res, 200, {
              jsonrpc: '2.0',
              id: body.id ?? null,
              result: { webhooks },
            })
            return
          }

          // Pass to MCP SDK transport for standard MCP methods
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          })

          res.on('close', () => {
            transport.close()
          })

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
          printStartupLog(config, tools, webhookRegistry, finalPort)
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
  webhookRegistry?: WebhookRegistry,
): SkedyulServerInstance {
  const headers = getDefaultHeaders(config.cors)

  // Print startup log once on cold start
  let hasLoggedStartup = false

  return {
    async handler(event: APIGatewayProxyEvent) {
      // Log startup info on first invocation (cold start)
      if (!hasLoggedStartup) {
        printStartupLog(config, tools, webhookRegistry)
        hasLoggedStartup = true
      }
      try {
        const path = event.path
        const method = event.httpMethod

        if (method === 'OPTIONS') {
          return createResponse(200, { message: 'OK' }, headers)
        }

        // Handle webhook requests: /webhooks/{handle}
        if (path.startsWith('/webhooks/') && webhookRegistry) {
          const handle = path.slice('/webhooks/'.length)
          const webhookDef = webhookRegistry[handle]

          if (!webhookDef) {
            return createResponse(404, { error: `Webhook handler '${handle}' not found` }, headers)
          }

          // Check if HTTP method is allowed
          const allowedMethods = webhookDef.methods ?? ['POST']
          if (!allowedMethods.includes(method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')) {
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

          // Check if this is an envelope format from the platform
          // Envelope format: { env: {...}, request: {...}, context: {...} }
          const isEnvelope = (
            typeof parsedBody === 'object' &&
            parsedBody !== null &&
            'env' in parsedBody &&
            'request' in parsedBody &&
            'context' in parsedBody
          )

          let webhookRequest: WebhookRequest
          let webhookContext: WebhookContext
          let requestEnv: Record<string, string> = {}

          if (isEnvelope) {
            // Platform envelope format - extract env, request, and context
            const envelope = parsedBody as {
              env: Record<string, string>
              request: {
                method: string
                url: string
                path: string
                headers: Record<string, string>
                query: Record<string, string>
                body: string
              }
              context: {
                app: { id: string; versionId: string }
                appInstallationId: string | null
                workplace: { id: string; subdomain: string } | null
                registration: Record<string, unknown> | null
              }
            }

            requestEnv = envelope.env ?? {}

            // Parse the original request body
            let originalParsedBody: unknown = envelope.request.body
            const originalContentType = envelope.request.headers['content-type'] ?? ''
            if (originalContentType.includes('application/json')) {
              try {
                originalParsedBody = envelope.request.body ? JSON.parse(envelope.request.body) : {}
              } catch {
                // Keep as string if JSON parsing fails
              }
            }

            webhookRequest = {
              method: envelope.request.method,
              url: envelope.request.url,
              path: envelope.request.path,
              headers: envelope.request.headers as Record<string, string | string[] | undefined>,
              query: envelope.request.query,
              body: originalParsedBody,
              rawBody: envelope.request.body ? Buffer.from(envelope.request.body, 'utf-8') : undefined,
            }

            const envVars = { ...process.env, ...requestEnv } as Record<string, string | undefined>
            const app = envelope.context.app

            // Build webhook context based on whether we have installation context
            if (envelope.context.appInstallationId && envelope.context.workplace) {
              // Runtime webhook context
              webhookContext = {
                env: envVars,
                app,
                appInstallationId: envelope.context.appInstallationId,
                workplace: envelope.context.workplace,
                registration: envelope.context.registration ?? {},
              }
            } else {
              // Provision webhook context
              webhookContext = {
                env: envVars,
                app,
              }
            }
          } else {
            // Direct request format (legacy or direct calls) - requires app info from headers or fail
            const appId = event.headers?.['x-skedyul-app-id'] ?? event.headers?.['X-Skedyul-App-Id']
            const appVersionId = event.headers?.['x-skedyul-app-version-id'] ?? event.headers?.['X-Skedyul-App-Version-Id']
            
            if (!appId || !appVersionId) {
              throw new Error('Missing app info in webhook request (x-skedyul-app-id and x-skedyul-app-version-id headers required)')
            }

            const forwardedProto =
              event.headers?.['x-forwarded-proto'] ??
              event.headers?.['X-Forwarded-Proto']
            const protocol = forwardedProto ?? 'https'
            const host = event.headers?.host ?? event.headers?.Host ?? 'localhost'
            const queryString = event.queryStringParameters
              ? '?' + new URLSearchParams(event.queryStringParameters as Record<string, string>).toString()
              : ''
            const webhookUrl = `${protocol}://${host}${path}${queryString}`

            webhookRequest = {
              method,
              url: webhookUrl,
              path,
              headers: event.headers as Record<string, string | string[] | undefined>,
              query: event.queryStringParameters ?? {},
              body: parsedBody,
              rawBody: rawBody ? Buffer.from(rawBody, 'utf-8') : undefined,
            }

            // Direct calls are provision-level (no installation context)
            webhookContext = {
              env: process.env as Record<string, string | undefined>,
              app: { id: appId, versionId: appVersionId },
            }
          }

          // Temporarily inject env into process.env for skedyul client to use
          // (same pattern as tool handler)
          const originalEnv = { ...process.env }
          Object.assign(process.env, requestEnv)

          // Build request-scoped config for the skedyul client
          // This uses AsyncLocalStorage to override the global config (same pattern as tools)
          const requestConfig = {
            baseUrl: requestEnv.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
            apiToken: requestEnv.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
          }

          // Invoke the handler with request-scoped config
          let webhookResponse: WebhookResponse
          try {
            webhookResponse = await runWithConfig(requestConfig, async () => {
              return await webhookDef.handler(webhookRequest, webhookContext)
            })
          } catch (err) {
            console.error(`Webhook handler '${handle}' error:`, err)
            return createResponse(500, { error: 'Webhook handler error' }, headers)
          } finally {
            // Restore original env
            process.env = originalEnv
          }

          // Build response headers
          const responseHeaders: Record<string, string> = {
            ...headers,
            ...webhookResponse.headers,
          }

          const status = webhookResponse.status ?? 200
          const body = webhookResponse.body

          return {
            statusCode: status,
            headers: responseHeaders,
            body: body !== undefined
              ? (typeof body === 'string' ? body : JSON.stringify(body))
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

          const method = coreBody.method as CoreMethod
          const result = await handleCoreMethod(method, coreBody.params)
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
          const webhookUrl = `${protocol}://${host}${event.path}`

          const coreWebhookRequest: CoreWebhookRequest = {
            method,
            headers: (event.headers ?? {}) as Record<string, string>,
            body: webhookBody,
            query: event.queryStringParameters ?? {},
            url: webhookUrl,
            path: event.path,
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

            const inputSchema = getZodSchema(tool.inputs)
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
              // Support both formats:
              // 1. Skedyul format: { inputs: {...}, context: {...}, env: {...} }
              // 2. Standard MCP format: { ...directArgs }
              const rawArgs = (params?.arguments ?? {}) as Record<string, unknown>
              const hasSkedyulFormat = 'inputs' in rawArgs || 'env' in rawArgs || 'context' in rawArgs
              const toolInputs = hasSkedyulFormat ? (rawArgs.inputs ?? {}) : rawArgs
              const toolContext = hasSkedyulFormat ? (rawArgs.context as Record<string, unknown> | undefined) : undefined
              const toolEnv = hasSkedyulFormat ? (rawArgs.env as Record<string, string> | undefined) : undefined

              // Debug logging for MCP tool calls
              console.log('\n📞 MCP tools/call received:')
              console.log('   Tool:', toolName)
              console.log('   Raw arguments:', JSON.stringify(rawArgs, null, 2))
              console.log('   Skedyul format detected:', hasSkedyulFormat)
              console.log('   Extracted inputs:', JSON.stringify(toolInputs, null, 2))
              console.log('   Extracted context:', JSON.stringify(toolContext, null, 2))
              console.log('   Extracted env keys:', toolEnv ? Object.keys(toolEnv) : 'none')

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

              try {
                const inputSchema = getZodSchema(tool.inputs)
                const outputSchema = getZodSchema(tool.outputSchema)
                const hasOutputSchema = Boolean(outputSchema)
                const validatedInputs = inputSchema
                  ? inputSchema.parse(toolInputs)
                  : toolInputs
                const toolResult = await callTool(toolKey, {
                  inputs: validatedInputs,
                  context: toolContext,
                  env: toolEnv,
                })

                // Transform internal format to MCP protocol format
                // Note: effect is embedded in structuredContent as __effect
                // for consistency with dedicated mode (MCP SDK strips custom fields)
                if (toolResult.error) {
                  const errorOutput = { error: toolResult.error }
                  result = {
                    content: [{ type: 'text', text: JSON.stringify(errorOutput) }],
                    structuredContent: errorOutput,
                    isError: true,
                    billing: toolResult.billing,
                  }
                } else {
                  const outputData = toolResult.output as Record<string, unknown> | null
                  const structuredContent = outputData
                    ? { ...outputData, __effect: toolResult.effect }
                    : toolResult.effect
                      ? { __effect: toolResult.effect }
                      : undefined
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

export const server = {
  create: createSkedyulServer,
}

