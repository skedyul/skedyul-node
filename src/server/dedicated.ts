import http, { IncomingMessage, ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import type {
  InstallHandler,
  InstallHandlerContext,
  OAuthCallbackHandler,
  OAuthCallbackContext,
  ProvisionHandler,
  ProvisionHandlerContext,
  SkedyulServerConfig,
  SkedyulServerInstance,
  ToolCallResponse,
  ToolMetadata,
  UninstallHandler,
  UninstallHandlerContext,
  WebhookRegistry,
  WebhookContext,
  WebhookResponse,
  WebhookRequest,
  InvocationContext,
} from '../types'
import type { WebhookRequest as CoreWebhookRequest } from '../core/types'
import type { RequestState, CoreMethod } from './types'
import { coreApiService } from '../core/service'
import { runWithConfig } from '../core/client'
import { InstallError } from '../errors'
import { handleCoreMethod } from './core-api-handler'
import { parseHandlerEnvelope, buildRequestFromRaw, buildRequestScopedConfig } from './handler-helpers'
import { printStartupLog } from './startup-logger'
import { runWithLogContext } from './context-logger'
import { createContextLogger } from './logger'
import {
  readRawRequestBody,
  parseJSONBody,
  sendJSON,
  getListeningPort,
} from './utils'

/**
 * Creates a dedicated (long-running HTTP) server instance
 */
export function createDedicatedServerInstance(
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
        // Envelope format: { env: {...}, request: {...}, context: {...}, invocation?: {...} }
        const envelope = parseHandlerEnvelope(parsedBody)

        let webhookRequest: WebhookRequest
        let webhookContext: WebhookContext
        let requestEnv: Record<string, string> = {}
        let invocation: InvocationContext | undefined

        if (envelope && 'context' in envelope && envelope.context) {
          // Platform envelope format - use shared helpers
          const context = envelope.context as {
            app: { id: string; versionId: string }
            appInstallationId: string | null
            workplace: { id: string; subdomain: string } | null
            registration: Record<string, unknown> | null
          }

          requestEnv = envelope.env
          
          // Extract invocation context from parsed body
          invocation = (parsedBody as { invocation?: InvocationContext }).invocation

          // Convert raw request to rich request using shared helper
          webhookRequest = buildRequestFromRaw(envelope.request)

          const envVars = { ...process.env, ...envelope.env } as Record<string, string | undefined>
          const app = context.app

          // Build webhook context based on whether we have installation context
          if (context.appInstallationId && context.workplace) {
            // Runtime webhook context
            webhookContext = {
              env: envVars,
              app,
              appInstallationId: context.appInstallationId,
              workplace: context.workplace,
              registration: context.registration ?? {},
              invocation,
              log: createContextLogger(),
            }
          } else {
            // Provision webhook context
            webhookContext = {
              env: envVars,
              app,
              invocation,
              log: createContextLogger(),
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
            log: createContextLogger(),
          }
        }

        // Temporarily inject env into process.env for skedyul client to use
        // (same pattern as tool handler)
        const originalEnv = { ...process.env }
        Object.assign(process.env, requestEnv)

        // Build request-scoped config for the skedyul client
        // This uses AsyncLocalStorage to override the global config (same pattern as tools)
        const requestConfig = buildRequestScopedConfig(requestEnv)

        // Invoke the handler with request-scoped config and log context
        let webhookResponse: WebhookResponse
        try {
          webhookResponse = await runWithLogContext({ invocation }, async () => {
            return await runWithConfig(requestConfig, async () => {
              return await webhookDef.handler(webhookRequest, webhookContext)
            })
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

      // Handle /oauth_callback endpoint for OAuth callbacks (called by Temporal workflow)
      if (pathname === '/oauth_callback' && req.method === 'POST') {
        if (!config.hooks?.oauth_callback) {
          sendJSON(res, 404, { error: 'OAuth callback handler not configured' })
          return
        }

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

        // Parse envelope using shared helper
        const envelope = parseHandlerEnvelope(parsedBody)
        if (!envelope) {
          console.error('[OAuth Callback] Failed to parse envelope. Body:', JSON.stringify(parsedBody, null, 2))
          sendJSON(res, 400, {
            error: { code: -32602, message: 'Missing envelope format: expected { env, request }' },
          })
          return
        }

        // Extract invocation context from envelope
        const invocation = (parsedBody as { invocation?: InvocationContext }).invocation

        // Convert raw request to rich request using shared helper
        const oauthRequest = buildRequestFromRaw(envelope.request)

        // Build request-scoped config using shared helper
        const oauthCallbackRequestConfig = buildRequestScopedConfig(envelope.env)

        const oauthCallbackContext: OAuthCallbackContext = {
          request: oauthRequest,
          invocation,
          log: createContextLogger(),
        }

        try {
          const oauthCallbackHook = config.hooks!.oauth_callback!
          const oauthCallbackHandler: OAuthCallbackHandler = typeof oauthCallbackHook === 'function'
            ? oauthCallbackHook
            : oauthCallbackHook.handler
          const result = await runWithLogContext({ invocation }, async () => {
            return await runWithConfig(oauthCallbackRequestConfig, async () => {
              return await oauthCallbackHandler(oauthCallbackContext)
            })
          })

          sendJSON(res, 200, {
            appInstallationId: result.appInstallationId,
            env: result.env ?? {},
          })
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error')
          sendJSON(res, 500, {
            error: {
              code: -32603,
              message: errorMessage,
            },
          })
        }
        return
      }

      // Handle /install endpoint for install handlers
      if (pathname === '/install' && req.method === 'POST') {
        if (!config.hooks?.install) {
          sendJSON(res, 404, { error: 'Install handler not configured' })
          return
        }

        let installBody: {
          env?: Record<string, string>
          invocation?: InvocationContext
          context?: {
            app: { id: string; versionId: string; handle: string; versionHandle: string }
            appInstallationId: string
            workplace: { id: string; subdomain: string }
          }
        }

        try {
          installBody = (await parseJSONBody(req)) as typeof installBody
        } catch {
          sendJSON(res, 400, {
            error: { code: -32700, message: 'Parse error' },
          })
          return
        }

        if (!installBody.context?.appInstallationId || !installBody.context?.workplace) {
          sendJSON(res, 400, {
            error: { code: -32602, message: 'Missing context (appInstallationId and workplace required)' },
          })
          return
        }

        const installContext: InstallHandlerContext = {
          env: installBody.env ?? {},
          workplace: installBody.context.workplace,
          appInstallationId: installBody.context.appInstallationId,
          app: installBody.context.app,
          invocation: installBody.invocation,
          log: createContextLogger(),
        }

        // Build request-scoped config for SDK access
        // Use env from request body (contains generated token from workflow)
        const installRequestConfig = {
          baseUrl:
            installBody.env?.SKEDYUL_API_URL ??
            process.env.SKEDYUL_API_URL ??
            '',
          apiToken:
            installBody.env?.SKEDYUL_API_TOKEN ??
            process.env.SKEDYUL_API_TOKEN ??
            '',
        }

        try {
          const installHook = config.hooks!.install!
          const installHandler: InstallHandler = typeof installHook === 'function' 
            ? installHook 
            : installHook.handler
          const result = await runWithLogContext({ invocation: installBody.invocation }, async () => {
            return await runWithConfig(installRequestConfig, async () => {
              return await installHandler(installContext)
            })
          })
          sendJSON(res, 200, {
            env: result.env ?? {},
            redirect: result.redirect,
          })
        } catch (err) {
          // Check for typed install errors
          if (err instanceof InstallError) {
            sendJSON(res, 400, {
              error: {
                code: err.code,
                message: err.message,
                field: err.field,
              },
            })
          } else {
            sendJSON(res, 500, {
              error: {
                code: -32603,
                message: err instanceof Error ? err.message : String(err ?? ''),
              },
            })
          }
        }
        return
      }

      // Handle /uninstall endpoint for uninstall handlers
      if (pathname === '/uninstall' && req.method === 'POST') {
        if (!config.hooks?.uninstall) {
          sendJSON(res, 404, { error: 'Uninstall handler not configured' })
          return
        }

        let uninstallBody: {
          env?: Record<string, string>
          invocation?: InvocationContext
          context?: {
            app: { id: string; versionId: string; handle: string; versionHandle: string }
            appInstallationId: string
            workplace: { id: string; subdomain: string }
          }
        }

        try {
          uninstallBody = (await parseJSONBody(req)) as typeof uninstallBody
        } catch {
          sendJSON(res, 400, {
            error: { code: -32700, message: 'Parse error' },
          })
          return
        }

        if (
          !uninstallBody.context?.appInstallationId ||
          !uninstallBody.context?.workplace ||
          !uninstallBody.context?.app
        ) {
          sendJSON(res, 400, {
            error: {
              code: -32602,
              message: 'Missing context (appInstallationId, workplace and app required)',
            },
          })
          return
        }

        const uninstallContext: UninstallHandlerContext = {
          env: uninstallBody.env ?? {},
          workplace: uninstallBody.context.workplace,
          appInstallationId: uninstallBody.context.appInstallationId,
          app: uninstallBody.context.app,
          invocation: uninstallBody.invocation,
          log: createContextLogger(),
        }

        const uninstallRequestConfig = {
          baseUrl:
            uninstallBody.env?.SKEDYUL_API_URL ??
            process.env.SKEDYUL_API_URL ??
            '',
          apiToken:
            uninstallBody.env?.SKEDYUL_API_TOKEN ??
            process.env.SKEDYUL_API_TOKEN ??
            '',
        }

        try {
          const uninstallHook = config.hooks!.uninstall!
          const uninstallHandlerFn: UninstallHandler =
            typeof uninstallHook === 'function' ? uninstallHook : uninstallHook.handler
          const result = await runWithLogContext({ invocation: uninstallBody.invocation }, async () => {
            return await runWithConfig(uninstallRequestConfig, async () => {
              return await uninstallHandlerFn(uninstallContext)
            })
          })
          sendJSON(res, 200, {
            cleanedWebhookIds: result.cleanedWebhookIds ?? [],
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

      // Handle /provision endpoint for provision handlers
      if (pathname === '/provision' && req.method === 'POST') {
        if (!config.hooks?.provision) {
          sendJSON(res, 404, { error: 'Provision handler not configured' })
          return
        }

        let provisionBody: {
          env?: Record<string, string>
          invocation?: InvocationContext
          context?: {
            app: { id: string; versionId: string }
          }
        }

        try {
          provisionBody = (await parseJSONBody(req)) as typeof provisionBody
        } catch {
          sendJSON(res, 400, {
            error: { code: -32700, message: 'Parse error' },
          })
          return
        }

        if (!provisionBody.context?.app) {
          sendJSON(res, 400, {
            error: { code: -32602, message: 'Missing context (app required)' },
          })
          return
        }

        // SECURITY: Merge process.env (baked-in secrets) with request env (API token).
        // This ensures secrets like MAILGUN_API_KEY come from the container,
        // while runtime values like SKEDYUL_API_TOKEN come from the request.
        const mergedEnv: Record<string, string> = {}
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            mergedEnv[key] = value
          }
        }
        // Request env overrides process.env (e.g., for SKEDYUL_API_TOKEN)
        Object.assign(mergedEnv, provisionBody.env ?? {})

        const provisionContext: ProvisionHandlerContext = {
          env: mergedEnv,
          app: provisionBody.context.app,
          invocation: provisionBody.invocation,
          log: createContextLogger(),
        }

        // Build request-scoped config for SDK access
        // Use merged env for consistency
        const provisionRequestConfig = {
          baseUrl: mergedEnv.SKEDYUL_API_URL ?? '',
          apiToken: mergedEnv.SKEDYUL_API_TOKEN ?? '',
        }

        try {
          const provisionHook = config.hooks!.provision!
          const provisionHandler: ProvisionHandler = typeof provisionHook === 'function' 
            ? provisionHook 
            : (provisionHook as { handler: ProvisionHandler }).handler
          const result = await runWithLogContext({ invocation: provisionBody.invocation }, async () => {
            return await runWithConfig(provisionRequestConfig, async () => {
              return await provisionHandler(provisionContext)
            })
          })
          sendJSON(res, 200, result)
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
          printStartupLog(config, tools, webhookRegistry, finalPort)
          resolve()
        })

        httpServer.once('error', reject)
      })
    },
    getHealthStatus: () => state.getHealthStatus(),
  }
}
