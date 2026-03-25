/**
 * Webhook handler definition types.
 *
 * Webhooks are HTTP endpoints that receive incoming requests
 * from external services.
 */

import type { ContextLogger } from '../../server/logger'

/**
 * HTTP methods supported by webhooks.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * Incoming webhook request.
 */
export interface WebhookRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string>
  body: unknown
  rawBody?: Buffer
}

/**
 * Context provided to webhook handlers.
 */
export interface WebhookHandlerContext {
  appInstallationId: string | null
  workplace: { id: string; subdomain: string | null } | null
  registration: Record<string, unknown>
  /** Context-aware logger that automatically includes invocation context */
  log: ContextLogger
}

/**
 * Response from a webhook handler.
 */
export interface WebhookHandlerResponse {
  status: number
  body?: unknown
  headers?: Record<string, string>
}

/**
 * Webhook handler function signature.
 */
export type WebhookHandlerFn = (
  request: WebhookRequest,
  context: WebhookHandlerContext,
) => Promise<WebhookHandlerResponse>

/**
 * Webhook handler definition.
 */
export interface WebhookHandlerDefinition {
  description?: string
  methods?: HttpMethod[]
  handler: WebhookHandlerFn
}

/**
 * Webhook registry type.
 * @deprecated Use WebhookRegistry from '../types/webhook' instead.
 */
export type Webhooks = Record<string, WebhookHandlerDefinition>

/**
 * Webhook metadata (serialized form without handler function).
 */
export interface WebhookHandlerMetadata {
  name: string
  description?: string
  methods?: HttpMethod[]
}
