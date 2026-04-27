/**
 * Route handlers - transport-agnostic implementations of all server routes.
 *
 * These handlers work with UnifiedRequest/UnifiedResponse and can be used
 * by both serverless (Lambda) and dedicated (HTTP) servers.
 */

import * as fs from 'fs'
import * as path from 'path'

import type { WebhookRequest as CoreWebhookRequest } from '../../core/types'
import type { ToolRegistryEntry, InvocationContext } from '../../types'
import type { CoreMethod } from '../types'
import type {
  UnifiedRequest,
  UnifiedResponse,
  RouteContext,
  ParsedJsonRpcBody,
  SkedyulToolCallArgs,
} from './types'
import { parseJsonBody, parseJsonRpcBody, getHeader, parseBodyByContentType } from './adapters'
import { coreApiService } from '../../core/service'
import { handleCoreMethod } from '../core-api-handler'
import { serializeConfig } from '../config-serializer'
import { getZodSchema } from '../utils/schema'
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
} from '../handlers'

/**
 * Path to pre-generated config file (created during Docker build).
 */
function getConfigFilePath(): string {
  return process.env.LAMBDA_TASK_ROOT
    ? path.join(process.env.LAMBDA_TASK_ROOT, '.skedyul', 'config.json')
    : '.skedyul/config.json'
}

/**
 * Handle GET /health
 */
export function handleHealthRoute(ctx: RouteContext): UnifiedResponse {
  return {
    status: 200,
    body: ctx.state.getHealthStatus(),
  }
}

/**
 * Handle GET /config
 */
export function handleConfigRoute(ctx: RouteContext): UnifiedResponse {
  const configFilePath = getConfigFilePath()

  try {
    console.log(`[/config] Checking for config file at: ${configFilePath}`)
    if (fs.existsSync(configFilePath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'))
      console.log(
        `[/config] Loaded config from file: tools=${fileConfig.tools?.length ?? 0}, webhooks=${fileConfig.webhooks?.length ?? 0}`,
      )
      console.log(
        `[/config] SENDING config with keys: ${Object.keys(fileConfig).join(', ')}`,
      )
      console.log(
        `[/config] SENDING full config: ${JSON.stringify(fileConfig).substring(0, 2000)}...`,
      )
      return { status: 200, body: fileConfig }
    }
    console.log('[/config] Config file not found, falling back to runtime serialization')
  } catch (err) {
    console.warn('[/config] Failed to read config file, falling back to runtime serialization:', err)
  }

  const serialized = serializeConfig(ctx.config)
  console.log(
    `[/config] Runtime serialization: tools=${serialized.tools?.length ?? 0}, webhooks=${serialized.webhooks?.length ?? 0}`,
  )
  console.log(
    `[/config] SENDING serialized config with keys: ${Object.keys(serialized).join(', ')}`,
  )
  console.log(
    `[/config] SENDING full serialized config: ${JSON.stringify(serialized).substring(0, 2000)}...`,
  )
  return { status: 200, body: serialized }
}

/**
 * Handle POST /core
 */
export async function handleCoreRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const parseResult = parseJsonBody<{ method?: CoreMethod; params?: Record<string, unknown> }>(req)
  if (!parseResult.success) {
    return parseResult.error
  }

  const coreBody = parseResult.data
  if (!coreBody?.method) {
    return {
      status: 400,
      body: {
        error: {
          code: -32602,
          message: 'Missing method',
        },
      },
    }
  }

  const result = await handleCoreMethod(coreBody.method, coreBody.params)
  return { status: result.status, body: result.payload }
}

/**
 * Handle POST /core/webhook
 */
export async function handleCoreWebhookRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const rawBody = req.body ?? ''

  let webhookBody: unknown
  try {
    webhookBody = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return { status: 400, body: { status: 'parse-error' } }
  }

  const coreWebhookRequest: CoreWebhookRequest = {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: webhookBody,
    query: req.query,
    url: req.url,
    path: req.path,
    rawBody: rawBody ? Buffer.from(rawBody, 'utf-8') : undefined,
  }

  const webhookResponse = await coreApiService.dispatchWebhook(coreWebhookRequest)

  return {
    status: webhookResponse.status,
    body: webhookResponse.body ?? {},
  }
}

/**
 * Handle POST /estimate
 */
export async function handleEstimateRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const parseResult = parseJsonBody<{ name?: string; inputs?: Record<string, unknown> }>(req)
  if (!parseResult.success) {
    return parseResult.error
  }

  const estimateBody = parseResult.data

  try {
    const toolName = estimateBody.name as string
    const toolArgs = estimateBody.inputs ?? {}

    let toolKey: string | null = null
    let tool: ToolRegistryEntry | null = null

    for (const [key, t] of Object.entries(ctx.registry)) {
      if (t.name === toolName || key === toolName) {
        toolKey = key
        tool = t
        break
      }
    }

    if (!tool || !toolKey) {
      return {
        status: 400,
        body: {
          error: {
            code: -32602,
            message: `Tool "${toolName}" not found`,
          },
        },
      }
    }

    const inputSchema = getZodSchema(tool.inputSchema)
    const validatedArgs = inputSchema ? inputSchema.parse(toolArgs) : toolArgs
    const estimateResponse = await ctx.callTool(toolKey, {
      inputs: validatedArgs,
      estimate: true,
    })

    return {
      status: 200,
      body: {
        billing: estimateResponse.billing ?? { credits: 0 },
      },
    }
  } catch (err) {
    return {
      status: 500,
      body: {
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err ?? ''),
        },
      },
    }
  }
}

/**
 * Handle POST /install
 */
export async function handleInstallRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const parseResult = parseJsonBody<InstallRequestBody>(req)
  if (!parseResult.success) {
    return parseResult.error
  }

  const result = await handleInstall(parseResult.data, ctx.config.hooks)
  return { status: result.status, body: result.body }
}

/**
 * Handle POST /uninstall
 */
export async function handleUninstallRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const parseResult = parseJsonBody<UninstallRequestBody>(req)
  if (!parseResult.success) {
    return parseResult.error
  }

  const result = await handleUninstall(parseResult.data, ctx.config.hooks)
  return { status: result.status, body: result.body }
}

/**
 * Handle POST /provision
 */
export async function handleProvisionRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const parseResult = parseJsonBody<ProvisionRequestBody>(req)
  if (!parseResult.success) {
    return parseResult.error
  }

  const result = await handleProvision(parseResult.data, ctx.config.hooks)
  return { status: result.status, body: result.body }
}

/**
 * Handle POST /oauth_callback
 */
export async function handleOAuthCallbackRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const parseResult = parseJsonBody(req)
  if (!parseResult.success) {
    console.error('[OAuth Callback] Failed to parse JSON body')
    return parseResult.error
  }

  const result = await handleOAuthCallback(parseResult.data, ctx.config.hooks)
  return { status: result.status, body: result.body }
}

/**
 * Handle /webhooks/{handle}
 */
export async function handleWebhookRoute(
  req: UnifiedRequest,
  handle: string,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  if (!ctx.webhookRegistry) {
    return { status: 404, body: { error: `Webhook handler '${handle}' not found` } }
  }

  if (!ctx.webhookRegistry[handle]) {
    return { status: 404, body: { error: `Webhook handler '${handle}' not found` } }
  }

  if (!isMethodAllowed(ctx.webhookRegistry, handle, req.method)) {
    return { status: 405, body: { error: `Method ${req.method} not allowed` } }
  }

  const rawBody = req.body ?? ''
  const parsedBody = parseBodyByContentType(req)

  const parseResult = parseWebhookRequest(
    parsedBody,
    req.method,
    req.url,
    req.path,
    req.headers,
    req.query,
    rawBody,
    getHeader(req, 'x-skedyul-app-id'),
    getHeader(req, 'x-skedyul-app-version-id'),
  )

  if ('error' in parseResult) {
    return { status: 400, body: { error: parseResult.error } }
  }

  const result = await executeWebhookHandler(handle, ctx.webhookRegistry, parseResult)

  return {
    status: result.status,
    body: result.body,
    headers: result.headers,
  }
}

/**
 * Handle POST /mcp (JSON-RPC)
 */
export async function handleMcpRoute(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const parseResult = parseJsonRpcBody<ParsedJsonRpcBody>(req)
  if (!parseResult.success) {
    return parseResult.error
  }

  const body = parseResult.data

  try {
    const { jsonrpc, id, method: rpcMethod, params } = body

    if (jsonrpc !== '2.0') {
      return {
        status: 400,
        body: {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
        },
      }
    }

    let result: unknown

    if (rpcMethod === 'tools/list') {
      result = { tools: ctx.tools }
    } else if (rpcMethod === 'tools/call') {
      return handleMcpToolsCall(params, id, ctx)
    } else if (rpcMethod === 'webhooks/list') {
      const webhooks = ctx.webhookRegistry
        ? Object.values(ctx.webhookRegistry).map((w) => ({
            name: w.name,
            description: w.description,
            methods: w.methods ?? ['POST'],
            type: w.type ?? 'WEBHOOK',
          }))
        : []
      result = { webhooks }
    } else {
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${rpcMethod}`,
          },
        },
      }
    }

    return {
      status: 200,
      body: {
        jsonrpc: '2.0',
        id,
        result,
      },
    }
  } catch (err) {
    return {
      status: 500,
      body: {
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err ?? ''),
        },
      },
    }
  }
}

/**
 * Handle MCP tools/call method
 */
async function handleMcpToolsCall(
  params: Record<string, unknown> | undefined,
  id: unknown,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  const toolName = params?.name as string
  const rawArgs = (params?.arguments ?? {}) as Record<string, unknown>

  console.log('[route-handlers /mcp] Received tools/call request:', JSON.stringify({
    toolName,
    hasArguments: !!params?.arguments,
    argumentKeys: rawArgs ? Object.keys(rawArgs) : [],
    hasEnv: 'env' in rawArgs,
    envKeys: rawArgs.env ? Object.keys(rawArgs.env as Record<string, unknown>) : [],
    hasApiToken: !!(rawArgs.env as Record<string, unknown>)?.SKEDYUL_API_TOKEN,
  }, null, 2))

  const hasSkedyulFormat =
    'inputs' in rawArgs || 'env' in rawArgs || 'context' in rawArgs || 'invocation' in rawArgs
  const toolInputs = hasSkedyulFormat ? (rawArgs.inputs ?? {}) : rawArgs
  const toolContext = hasSkedyulFormat
    ? (rawArgs.context as Record<string, unknown> | undefined)
    : undefined
  const toolEnv = hasSkedyulFormat
    ? (rawArgs.env as Record<string, string> | undefined)
    : undefined
  const toolInvocation = hasSkedyulFormat
    ? (rawArgs.invocation as InvocationContext | undefined)
    : undefined

  console.log('[route-handlers /mcp] Extracted env:', JSON.stringify({
    hasSkedyulFormat,
    hasToolEnv: !!toolEnv,
    toolEnvKeys: toolEnv ? Object.keys(toolEnv) : [],
    hasApiToken: toolEnv?.SKEDYUL_API_TOKEN
      ? `yes (${toolEnv.SKEDYUL_API_TOKEN.length} chars)`
      : 'no',
  }, null, 2))

  let toolKey: string | null = null
  let tool: ToolRegistryEntry | null = null

  for (const [key, t] of Object.entries(ctx.registry)) {
    if (t.name === toolName || key === toolName) {
      toolKey = key
      tool = t
      break
    }
  }

  if (!tool || !toolKey) {
    return {
      status: 200,
      body: {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: `Tool "${toolName}" not found`,
        },
      },
    }
  }

  try {
    const inputSchema = getZodSchema(tool.inputSchema)
    const outputSchema = getZodSchema(tool.outputSchema)
    const hasOutputSchema = Boolean(outputSchema)
    const validatedInputs = inputSchema ? inputSchema.parse(toolInputs) : toolInputs
    const toolResult = await ctx.callTool(toolKey, {
      inputs: validatedInputs,
      context: toolContext,
      env: toolEnv,
      invocation: toolInvocation,
    })

    let result: unknown

    // Detect failure using multiple patterns for backward compatibility:
    // 1. New shape: success === false (discriminated union)
    // 2. Legacy shape: error field is set
    // 3. Legacy shape: meta.success === false
    const isNewShapeFailure = 'success' in toolResult && toolResult.success === false
    const isLegacyErrorFailure = 'error' in toolResult && toolResult.error != null
    const isLegacyMetaFailure =
      'meta' in toolResult &&
      toolResult.meta != null &&
      typeof toolResult.meta === 'object' &&
      'success' in toolResult.meta &&
      toolResult.meta.success === false

    const isFailure = isNewShapeFailure || isLegacyErrorFailure || isLegacyMetaFailure

    if (isFailure) {
      // Build error output from available error information
      let errorOutput: { error: unknown; retry?: unknown }

      if (isNewShapeFailure && 'error' in toolResult) {
        // New shape: use the structured error directly
        errorOutput = {
          error: toolResult.error,
          retry: 'retry' in toolResult ? toolResult.retry : undefined,
        }
      } else if (isLegacyErrorFailure && 'error' in toolResult) {
        // Legacy shape with error field
        errorOutput = { error: toolResult.error }
      } else if (isLegacyMetaFailure && 'meta' in toolResult && toolResult.meta) {
        // Legacy shape with meta.success === false - construct error from meta.message
        const meta = toolResult.meta as { message?: string }
        errorOutput = {
          error: {
            code: 'TOOL_FAILED',
            message: meta.message ?? 'Tool execution failed',
            category: 'internal',
          },
        }
      } else {
        // Fallback
        errorOutput = {
          error: {
            code: 'TOOL_FAILED',
            message: 'Tool execution failed',
            category: 'internal',
          },
        }
      }

      result = {
        content: [{ type: 'text', text: JSON.stringify(errorOutput) }],
        structuredContent: hasOutputSchema ? undefined : errorOutput,
        isError: true,
        billing: 'billing' in toolResult ? toolResult.billing : undefined,
      }
    } else {
      // Success case - handle both new and legacy shapes
      const outputData =
        'output' in toolResult
          ? (toolResult.output as Record<string, unknown> | null)
          : null
      const effect = 'effect' in toolResult ? toolResult.effect : undefined
      const warnings = 'warnings' in toolResult ? toolResult.warnings : undefined
      const pagination = 'pagination' in toolResult ? toolResult.pagination : undefined

      let structuredContent: Record<string, unknown> | undefined
      if (outputData) {
        structuredContent = {
          ...outputData,
          __effect: effect,
          __warnings: warnings,
          __pagination: pagination,
        }
      } else if (effect || warnings || pagination) {
        structuredContent = {
          __effect: effect,
          __warnings: warnings,
          __pagination: pagination,
        }
      } else if (hasOutputSchema) {
        structuredContent = {}
      }

      result = {
        content: [{ type: 'text', text: JSON.stringify(outputData) }],
        structuredContent,
        billing: 'billing' in toolResult ? toolResult.billing : undefined,
      }
    }

    return {
      status: 200,
      body: {
        jsonrpc: '2.0',
        id,
        result,
      },
    }
  } catch (validationError) {
    return {
      status: 200,
      body: {
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
    }
  }
}

/**
 * Create a 404 Not Found response in JSON-RPC format.
 */
export function createNotFoundResponse(): UnifiedResponse {
  return {
    status: 404,
    body: {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32601,
        message: 'Not Found',
      },
    },
  }
}

/**
 * Create an OPTIONS response.
 */
export function createOptionsResponse(): UnifiedResponse {
  return {
    status: 200,
    body: { message: 'OK' },
  }
}

/**
 * Create an internal error response.
 */
export function createErrorResponse(err: unknown): UnifiedResponse {
  return {
    status: 500,
    body: {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err ?? ''),
      },
    },
  }
}
