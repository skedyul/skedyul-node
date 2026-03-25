/**
 * Webhook handler - shared implementation for serverless and dedicated servers.
 */

import type {
  WebhookContext,
  WebhookResponse,
  WebhookRequest,
  InvocationContext,
  WebhookRegistry,
} from '../../types'
import type { HandlerResult, EnvelopeContext } from './types'
import { runWithConfig } from '../../core/client'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'

/**
 * Parsed webhook request data.
 */
export interface ParsedWebhookData {
  webhookRequest: WebhookRequest
  webhookContext: WebhookContext
  requestEnv: Record<string, string>
  invocation?: InvocationContext
}

/**
 * Parse webhook request from envelope or direct format.
 */
export function parseWebhookRequest(
  parsedBody: unknown,
  method: string,
  url: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string>,
  rawBody: string,
  appIdHeader?: string,
  appVersionIdHeader?: string,
): ParsedWebhookData | { error: string } {
  // Check if this is an envelope format from the platform
  const isEnvelope = (
    typeof parsedBody === 'object' &&
    parsedBody !== null &&
    'env' in parsedBody &&
    'request' in parsedBody &&
    'context' in parsedBody
  )

  if (isEnvelope) {
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
      context: EnvelopeContext
      invocation?: InvocationContext
    }

    const requestEnv = envelope.env ?? {}
    const invocation = envelope.invocation

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

    const webhookRequest: WebhookRequest = {
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
    let webhookContext: WebhookContext
    if (envelope.context.appInstallationId && envelope.context.workplace) {
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
      webhookContext = {
        env: envVars,
        app,
        invocation,
        log: createContextLogger(),
      }
    }

    return { webhookRequest, webhookContext, requestEnv, invocation }
  }

  // Direct request format (legacy or direct calls) - requires app info from headers
  if (!appIdHeader || !appVersionIdHeader) {
    return {
      error: 'Missing app info in webhook request (x-skedyul-app-id and x-skedyul-app-version-id headers required)',
    }
  }

  const webhookRequest: WebhookRequest = {
    method,
    url,
    path,
    headers,
    query,
    body: parsedBody,
    rawBody: rawBody ? Buffer.from(rawBody, 'utf-8') : undefined,
  }

  const webhookContext: WebhookContext = {
    env: process.env as Record<string, string | undefined>,
    app: { id: appIdHeader, versionId: appVersionIdHeader },
    log: createContextLogger(),
  }

  return { webhookRequest, webhookContext, requestEnv: {} }
}

/**
 * Execute webhook handler with proper context.
 */
export async function executeWebhookHandler(
  handle: string,
  webhookRegistry: WebhookRegistry,
  data: ParsedWebhookData,
): Promise<HandlerResult> {
  const webhookDef = webhookRegistry[handle]
  if (!webhookDef) {
    return {
      status: 404,
      body: { error: `Webhook handler '${handle}' not found` },
    }
  }

  // Temporarily inject env into process.env for skedyul client to use
  const originalEnv = { ...process.env }
  Object.assign(process.env, data.requestEnv)

  // Build request-scoped config for the skedyul client
  const requestConfig = {
    baseUrl: data.requestEnv.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
    apiToken: data.requestEnv.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
  }

  let webhookResponse: WebhookResponse
  try {
    webhookResponse = await runWithLogContext({ invocation: data.invocation }, async () => {
      return await runWithConfig(requestConfig, async () => {
        return await webhookDef.handler(data.webhookRequest, data.webhookContext)
      })
    })
  } catch (err) {
    console.error(`Webhook handler '${handle}' error:`, err)
    return {
      status: 500,
      body: { error: 'Webhook handler error' },
    }
  } finally {
    // Restore original env
    process.env = originalEnv
  }

  return {
    status: webhookResponse.status ?? 200,
    body: webhookResponse.body,
    headers: webhookResponse.headers,
  }
}

/**
 * Check if HTTP method is allowed for webhook.
 */
export function isMethodAllowed(
  webhookRegistry: WebhookRegistry,
  handle: string,
  method: string,
): boolean {
  const webhookDef = webhookRegistry[handle]
  if (!webhookDef) return false
  const allowedMethods = webhookDef.methods ?? ['POST']
  return allowedMethods.includes(method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')
}
