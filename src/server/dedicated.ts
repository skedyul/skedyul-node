import http, { IncomingMessage, ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import type {
  SkedyulServerInstance,
  ToolCallResponse,
  ToolMetadata,
} from '../types'
import type { RuntimeSkedyulConfig } from './index'
import type { RequestState } from './types'
import { printStartupLog } from './startup-logger'
import {
  readRawRequestBody,
  parseJSONBody,
  sendJSON,
  getListeningPort,
  getDefaultHeaders,
} from './utils'
import {
  routeRequest,
  type RouteContext,
  type UnifiedRequest,
  type UnifiedResponse,
} from './route-handlers'

/**
 * Convert Node.js HTTP request to UnifiedRequest.
 */
function fromHttpRequest(
  req: IncomingMessage,
  url: URL,
  rawBody: string,
): UnifiedRequest {
  return {
    path: url.pathname,
    method: req.method ?? 'GET',
    headers: req.headers as Record<string, string | string[] | undefined>,
    query: Object.fromEntries(url.searchParams.entries()),
    body: rawBody,
    url: url.toString(),
  }
}

/**
 * Send a UnifiedResponse to the HTTP response.
 */
function sendUnifiedResponse(
  res: ServerResponse,
  response: UnifiedResponse,
  defaultHeaders: Record<string, string>,
): void {
  const headers: Record<string, string> = {
    ...defaultHeaders,
    ...response.headers,
  }

  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json'
  }

  res.writeHead(response.status, headers)

  if (response.body !== undefined) {
    if (typeof response.body === 'string') {
      res.end(response.body)
    } else {
      res.end(JSON.stringify(response.body))
    }
  } else {
    res.end()
  }
}

/**
 * Creates a dedicated (long-running HTTP) server instance
 */
export function createDedicatedServerInstance(
  config: RuntimeSkedyulConfig,
  tools: ToolMetadata[],
  callTool: (toolNameInput: unknown, toolArgsInput: unknown) => Promise<ToolCallResponse>,
  state: RequestState,
  mcpServer: McpServer,
): SkedyulServerInstance {
  const port = getListeningPort(config)
  const defaultHeaders = getDefaultHeaders(config.cors)
  const registry = config.tools
  const webhookRegistry = config.webhooks

  const ctx: RouteContext = {
    config,
    tools,
    registry,
    webhookRegistry,
    callTool,
    state,
    mcpServer,
    defaultHeaders,
  }

  const httpServer = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(
          req.url || '/',
          `http://${req.headers.host || 'localhost'}`,
        )
        const pathname = url.pathname

        // For /mcp tools/call, we use the MCP SDK transport for streaming support
        // All other routes use the shared route handlers
        if (pathname === '/mcp' && req.method === 'POST') {
          await handleMcpWithSdkTransport(req, res, url, ctx, mcpServer)
          return
        }

        // Read raw body for all other routes
        let rawBody: string
        try {
          rawBody = await readRawRequestBody(req)
        } catch {
          sendJSON(res, 400, { error: 'Failed to read request body' })
          return
        }

        const unifiedReq = fromHttpRequest(req, url, rawBody)
        const response = await routeRequest(unifiedReq, ctx)
        sendUnifiedResponse(res, response, defaultHeaders)
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
    },
  )

  return {
    async listen(listenPort?: number) {
      const finalPort = listenPort ?? port
      return new Promise<void>((resolve, reject) => {
        httpServer.listen(finalPort, () => {
          printStartupLog(config, tools, finalPort)
          resolve()
        })

        httpServer.once('error', reject)
      })
    },
    getHealthStatus: () => state.getHealthStatus(),
  }
}

/**
 * Handle /mcp endpoint with MCP SDK transport for tools/call streaming support.
 * For tools/list and webhooks/list, we handle directly to include custom metadata.
 */
async function handleMcpWithSdkTransport(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: RouteContext,
  mcpServer: McpServer,
): Promise<void> {
  try {
    const body = (await parseJSONBody(req)) as {
      jsonrpc?: string
      id?: unknown
      method?: string
      params?: { name?: string; arguments?: Record<string, unknown> }
    }

    if (body?.method === 'tools/call') {
      console.log(
        '[dedicated.ts /mcp] Received tools/call request:',
        JSON.stringify(
          {
            method: body.method,
            toolName: body.params?.name,
            hasArguments: !!body.params?.arguments,
            argumentKeys: body.params?.arguments
              ? Object.keys(body.params.arguments)
              : [],
            hasEnv: !!body.params?.arguments?.env,
            envKeys: body.params?.arguments?.env
              ? Object.keys(body.params.arguments.env as Record<string, unknown>)
              : [],
            hasApiToken: !!(body.params?.arguments?.env as Record<string, unknown>)
              ?.SKEDYUL_API_TOKEN,
          },
          null,
          2,
        ),
      )
    }

    // Handle tools/list directly to include custom metadata (timeout, displayName, outputSchema)
    if (body?.method === 'tools/list') {
      sendJSON(res, 200, {
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: { tools: ctx.tools },
      })
      return
    }

    // Handle webhooks/list directly
    if (body?.method === 'webhooks/list') {
      const webhooks = ctx.webhookRegistry
        ? Object.values(ctx.webhookRegistry).map((w) => ({
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

    // Pass to MCP SDK transport for tools/call (streaming support)
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
}
