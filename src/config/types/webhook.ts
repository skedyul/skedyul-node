// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handler Definitions
// ─────────────────────────────────────────────────────────────────────────────

import type { ContextLogger } from '../../server/logger'

export type WebhookHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface WebhookRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string>
  body: unknown
  rawBody?: Buffer
}

export interface WebhookHandlerContext {
  appInstallationId: string | null
  workplace: { id: string; subdomain: string | null } | null
  registration: Record<string, unknown>
  /** Context-aware logger that automatically includes invocation context */
  log: ContextLogger
}

export interface WebhookHandlerResponse {
  status: number
  body?: unknown
  headers?: Record<string, string>
}

export type WebhookHandlerFn = (
  request: WebhookRequest,
  context: WebhookHandlerContext,
) => Promise<WebhookHandlerResponse>

export interface WebhookHandlerDefinition {
  description?: string
  methods?: WebhookHttpMethod[]
  handler: WebhookHandlerFn
}

export type Webhooks = Record<string, WebhookHandlerDefinition>

export interface WebhookHandlerMetadata {
  name: string
  description?: string
  methods?: WebhookHttpMethod[]
}
