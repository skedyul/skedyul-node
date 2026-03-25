import * as fs from 'fs'
import http, { IncomingMessage, ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import type {
  SkedyulServerInstance,
  ToolCallResponse,
  ToolMetadata,
  InvocationContext,
} from '../types'
import type { RuntimeSkedyulConfig } from './index'
import type { WebhookRequest as CoreWebhookRequest } from '../core/types'
import type { RequestState, CoreMethod } from './types'
import { coreApiService } from '../core/service'
import { handleCoreMethod } from './core-api-handler'
import { printStartupLog } from './startup-logger'
import { serializeConfig } from './config-serializer'
import {
  readRawRequestBody,
  parseJSONBody,
  sendJSON,
  getListeningPort,
} from './utils'
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

/** Path to pre-generated config file (created during Docker build) */
const CONFIG_FILE_PATH = '.skedyul/config.json'

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
  const registry = config.tools
  const webhookRegistry = config.webhooks
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

      // GET /config - Returns app configuration metadata
      // Used by deployment workflow to extract tool timeouts, webhooks, etc.
      // Reads from pre-generated .skedyul/config.json (created during build)
      // Falls back to runtime serialization for local dev without build
      if (pathname === '/config' && req.method === 'GET') {
        // Try to read pre-generated config file first (created by skedyul config:export)
        try {
          if (fs.existsSync(CONFIG_FILE_PATH)) {
            const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf-8'))
            sendJSON(res, 200, fileConfig)
            return
          }
        } catch (err) {
          console.warn('[/config] Failed to read config file, falling back to runtime serialization:', err)
        }
        // Fallback to runtime serialization (for local dev without build)
        sendJSON(res, 200, serializeConfig(config))
        return
      }

      // Handle webhook requests: /webhooks/{handle}
      if (pathname.startsWith('/webhooks/') && webhookRegistry) {
        const handle = pathname.slice('/webhooks/'.length)

        if (!webhookRegistry[handle]) {
          sendJSON(res, 404, { error: `Webhook handler '${handle}' not found` })
          return
        }

        // Check if HTTP method is allowed
        if (!isMethodAllowed(webhookRegistry, handle, req.method ?? 'POST')) {
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

        // Parse webhook request using shared handler
        const parseResult = parseWebhookRequest(
          parsedBody,
          req.method ?? 'POST',
          url.toString(),
          pathname,
          req.headers as Record<string, string | string[] | undefined>,
          Object.fromEntries(url.searchParams.entries()),
          rawBody,
          req.headers['x-skedyul-app-id'] as string | undefined,
          req.headers['x-skedyul-app-version-id'] as string | undefined,
        )

        if ('error' in parseResult) {
          sendJSON(res, 400, { error: parseResult.error })
          return
        }

        // Execute webhook handler
        const result = await executeWebhookHandler(handle, webhookRegistry, parseResult)

        // Send response
        const responseHeaders: Record<string, string> = {
          ...result.headers,
        }

        // Default to JSON content type if not specified
        if (!responseHeaders['Content-Type'] && !responseHeaders['content-type']) {
          responseHeaders['Content-Type'] = 'application/json'
        }

        res.writeHead(result.status, responseHeaders)

        if (result.body !== undefined) {
          if (typeof result.body === 'string') {
            res.end(result.body)
          } else {
            res.end(JSON.stringify(result.body))
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

      // Handle /oauth_callback endpoint for OAuth callbacks (called by Temporal workflow)
      if (pathname === '/oauth_callback' && req.method === 'POST') {
        let parsedBody: unknown
        try {
          parsedBody = await parseJSONBody(req)
        } catch (err) {
          console.error('[OAuth Callback] Failed to parse JSON body:', err)
          sendJSON(res, 400, {
            error: { code: -32700, message: 'Parse error' },
          })
          return
        }

        const result = await handleOAuthCallback(parsedBody, config.hooks)
        sendJSON(res, result.status, result.body)
        return
      }

      // Handle /install endpoint for install handlers
      if (pathname === '/install' && req.method === 'POST') {
        let installBody: InstallRequestBody

        try {
          installBody = (await parseJSONBody(req)) as InstallRequestBody
        } catch {
          sendJSON(res, 400, {
            error: { code: -32700, message: 'Parse error' },
          })
          return
        }

        const result = await handleInstall(installBody, config.hooks)
        sendJSON(res, result.status, result.body)
        return
      }

      // Handle /uninstall endpoint for uninstall handlers
      if (pathname === '/uninstall' && req.method === 'POST') {
        let uninstallBody: UninstallRequestBody

        try {
          uninstallBody = (await parseJSONBody(req)) as UninstallRequestBody
        } catch {
          sendJSON(res, 400, {
            error: { code: -32700, message: 'Parse error' },
          })
          return
        }

        const result = await handleUninstall(uninstallBody, config.hooks)
        sendJSON(res, result.status, result.body)
        return
      }

      // Handle /provision endpoint for provision handlers
      if (pathname === '/provision' && req.method === 'POST') {
        let provisionBody: ProvisionRequestBody

        try {
          provisionBody = (await parseJSONBody(req)) as ProvisionRequestBody
        } catch {
          sendJSON(res, 400, {
            error: { code: -32700, message: 'Parse error' },
          })
          return
        }

        const result = await handleProvision(provisionBody, config.hooks)
        sendJSON(res, result.status, result.body)
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
          const body = await parseJSONBody(req) as { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }

          // Debug: Log incoming MCP request to trace env passthrough
          if (body?.method === 'tools/call') {
            console.log('[dedicated.ts /mcp] Received tools/call request:', JSON.stringify({
              method: body.method,
              toolName: body.params?.name,
              hasArguments: !!body.params?.arguments,
              argumentKeys: body.params?.arguments ? Object.keys(body.params.arguments) : [],
              hasEnv: !!body.params?.arguments?.env,
              envKeys: body.params?.arguments?.env ? Object.keys(body.params.arguments.env as Record<string, unknown>) : [],
              hasApiToken: !!(body.params?.arguments?.env as Record<string, unknown>)?.SKEDYUL_API_TOKEN,
            }, null, 2))
          }

          // Handle tools/list directly to include custom metadata (timeout, displayName, outputSchema)
          // The MCP SDK only returns standard fields, so we intercept and return the full metadata
          if (body?.method === 'tools/list') {
            sendJSON(res, 200, {
              jsonrpc: '2.0',
              id: body.id ?? null,
              result: { tools },
            })
            return
          }

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

          // Pass to MCP SDK transport for standard MCP methods (tools/call, etc.)
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
          printStartupLog(config, tools, finalPort)
          resolve()
        })

        httpServer.once('error', reject)
      })
    },
    getHealthStatus: () => state.getHealthStatus(),
  }
}
