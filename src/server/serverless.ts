import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type {
  APIGatewayProxyEvent,
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
  ToolRegistry,
  ToolRegistryEntry,
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
import { getZodSchema, getDefaultHeaders, createResponse } from './utils'
import { resolveConfig, createMinimalConfig } from '../config/resolve'

/**
 * Creates a serverless (Lambda-style) server instance
 */
export function createServerlessInstance(
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
          // Envelope format: { env: {...}, request: {...}, context: {...}, invocation?: {...} }
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
          let invocation: InvocationContext | undefined

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
              invocation?: InvocationContext
            }

            requestEnv = envelope.env ?? {}
            invocation = envelope.invocation

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
              log: createContextLogger(),
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
          if (!config.hooks?.install) {
            return createResponse(404, { error: 'Install handler not configured' }, headers)
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
            installBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              { error: { code: -32700, message: 'Parse error' } },
              headers,
            )
          }

          if (!installBody.context?.appInstallationId || !installBody.context?.workplace) {
            return createResponse(
              400,
              { error: { code: -32602, message: 'Missing context (appInstallationId and workplace required)' } },
              headers,
            )
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
            return createResponse(
              200,
              { env: result.env ?? {}, redirect: result.redirect },
              headers,
            )
          } catch (err) {
            // Check for typed install errors
            if (err instanceof InstallError) {
              return createResponse(
                400,
                {
                  error: {
                    code: err.code,
                    message: err.message,
                    field: err.field,
                  },
                },
                headers,
              )
            }
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

        // Handle /uninstall endpoint for uninstall handlers
        if (path === '/uninstall' && method === 'POST') {
          if (!config.hooks?.uninstall) {
            return createResponse(404, { error: 'Uninstall handler not configured' }, headers)
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
            uninstallBody = event.body ? JSON.parse(event.body) : {}
          } catch {
            return createResponse(
              400,
              { error: { code: -32700, message: 'Parse error' } },
              headers,
            )
          }

          if (
            !uninstallBody.context?.appInstallationId ||
            !uninstallBody.context?.workplace ||
            !uninstallBody.context?.app
          ) {
            return createResponse(
              400,
              {
                error: {
                  code: -32602,
                  message: 'Missing context (appInstallationId, workplace and app required)',
                },
              },
              headers,
            )
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
            return createResponse(
              200,
              { cleanedWebhookIds: result.cleanedWebhookIds ?? [] },
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

        // Handle /provision endpoint for provision handlers
        if (path === '/provision' && method === 'POST') {
          console.log('[serverless] /provision endpoint called')
          
          if (!config.hooks?.provision) {
            console.log('[serverless] No provision handler configured')
            return createResponse(404, { error: 'Provision handler not configured' }, headers)
          }

          let provisionBody: {
            env?: Record<string, string>
            invocation?: InvocationContext
            context?: {
              app: { id: string; versionId: string }
            }
          }

          try {
            provisionBody = event.body ? JSON.parse(event.body) : {}
            console.log('[serverless] Provision body parsed:', {
              hasEnv: !!provisionBody.env,
              hasContext: !!provisionBody.context,
              appId: provisionBody.context?.app?.id,
              versionId: provisionBody.context?.app?.versionId,
            })
          } catch {
            console.log('[serverless] Failed to parse provision body')
            return createResponse(
              400,
              { error: { code: -32700, message: 'Parse error' } },
              headers,
            )
          }

          if (!provisionBody.context?.app) {
            console.log('[serverless] Missing app context in provision body')
            return createResponse(
              400,
              { error: { code: -32602, message: 'Missing context (app required)' } },
              headers,
            )
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
          const provisionRequestConfig = {
            baseUrl: mergedEnv.SKEDYUL_API_URL ?? '',
            apiToken: mergedEnv.SKEDYUL_API_TOKEN ?? '',
          }

          console.log('[serverless] Calling provision handler...')
          try {
            const provisionHook = config.hooks!.provision!
            const provisionHandler: ProvisionHandler =
              typeof provisionHook === 'function'
                ? provisionHook
                : (provisionHook as { handler: ProvisionHandler }).handler
            const result = await runWithLogContext({ invocation: provisionBody.invocation }, async () => {
              return await runWithConfig(provisionRequestConfig, async () => {
                return await provisionHandler(provisionContext)
              })
            })
            console.log('[serverless] Provision handler completed successfully')
            return createResponse(200, result, headers)
          } catch (err) {
            console.error('[serverless] Provision handler failed:', err instanceof Error ? err.message : String(err))
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

        // Handle /oauth_callback endpoint for OAuth callbacks (called by platform route)
        if (path === '/oauth_callback' && method === 'POST') {
          if (!config.hooks?.oauth_callback) {
            return createResponse(
              404,
              { error: 'OAuth callback handler not configured' },
              headers,
            )
          }

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

          // Parse envelope using shared helper
          const envelope = parseHandlerEnvelope(parsedBody)
          if (!envelope) {
            console.error('[OAuth Callback] Failed to parse envelope. Body:', JSON.stringify(parsedBody, null, 2))
            return createResponse(
              400,
              { error: { code: -32602, message: 'Missing envelope format: expected { env, request }' } },
              headers,
            )
          }

          // Extract invocation context from parsed body
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

            return createResponse(
              200,
              {
                appInstallationId: result.appInstallationId,
                env: result.env ?? {},
              },
              headers,
            )
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error')
            return createResponse(
              500,
              {
                error: {
                  code: -32603,
                  message: errorMessage,
                },
              },
              headers,
            )
          }
        }

        if (path === '/health' && method === 'GET') {
          return createResponse(200, state.getHealthStatus(), headers)
        }

        // GET /config - Returns full app configuration metadata
        // Used by deployment workflow to extract tool timeouts, webhooks, etc.
        if (path === '/config' && method === 'GET') {
          // Load app config lazily to avoid bundling provision/install at build time
          let appConfig = config.appConfig
          if (!appConfig && config.appConfigLoader) {
            const loaded = await config.appConfigLoader()
            appConfig = loaded.default
          }
          if (!appConfig) {
            appConfig = createMinimalConfig(
              config.metadata.name,
              config.metadata.version,
            )
          }
          const serializedConfig = await resolveConfig(appConfig, registry, webhookRegistry)
          return createResponse(200, serializedConfig, headers)
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
