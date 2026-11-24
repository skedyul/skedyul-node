import type { AppInfo, WorkplaceInfo } from './shared'
import type { InvocationContext } from './invocation'
import type { ContextLogger } from '../server/logger'

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw HTTP request shape sent over the wire in handler envelopes.
 * This is the wire format used by both webhooks and OAuth callbacks.
 * It gets converted to the rich WebhookRequest type at parse time.
 */
export interface WebhookWireRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string>
  query: Record<string, string>
  body: string  // Raw body as string
}

/**
 * @deprecated Use WebhookWireRequest instead.
 */
export type HandlerRawRequest = WebhookWireRequest

/** Raw HTTP request received by webhooks */
export interface WebhookRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string>
  /** Raw body - could be Buffer, string, or parsed object depending on content type */
  body: Buffer | string | unknown
  /** Original raw body as Buffer if available */
  rawBody?: Buffer
}

export interface WebhookResponse {
  status?: number
  headers?: Record<string, string>
  body?: unknown
}

/** Base webhook context */
interface BaseWebhookContext {
  /** Environment variables */
  env: Record<string, string | undefined>
  /** App info */
  app: AppInfo
  /** Invocation context for log traceability */
  invocation?: InvocationContext
  /** Context-aware logger that automatically includes invocation context */
  log: ContextLogger
}

/** Provision-level webhook context - no installation or workplace */
export interface ProvisionWebhookContext extends BaseWebhookContext {
  // No additional fields for provision-level webhooks
}

/** Runtime webhook context - has installation and workplace */
export interface RuntimeWebhookContext extends BaseWebhookContext {
  appInstallationId: string
  workplace: WorkplaceInfo
  /** Registration metadata passed when webhook.create() was called */
  registration?: Record<string, unknown>
}

/** Discriminated union of webhook contexts */
export type WebhookContext = ProvisionWebhookContext | RuntimeWebhookContext

/** Type guard for runtime webhook context */
export function isRuntimeWebhookContext(ctx: WebhookContext): ctx is RuntimeWebhookContext {
  return 'appInstallationId' in ctx && ctx.appInstallationId !== undefined
}

export type WebhookHandler = (
  request: WebhookRequest,
  context: WebhookContext,
) => Promise<WebhookResponse> | WebhookResponse

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Lifecycle Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookLifecycleContext {
  /** The Skedyul-generated webhook URL for this webhook */
  webhookUrl: string
  /** Environment variables available during lifecycle operation */
  env: Record<string, string | undefined>
}

export interface CommunicationChannelLifecycleContext extends WebhookLifecycleContext {
  /** The communication channel being configured */
  communicationChannel: {
    id: string
    /** The identifier value (e.g., phone number like "+15551234567") */
    identifierValue: string
    /** The channel handle (e.g., "sms") */
    handle: string
  }
}

export interface WebhookLifecycleResult {
  /** External ID from the provider (e.g., phone number SID) */
  externalId: string
  /** Optional message describing what was configured */
  message?: string
  /** Optional metadata from the provider */
  metadata?: Record<string, unknown>
}

/**
 * Lifecycle hook for webhook operations.
 * Return null if the API doesn't support programmatic management.
 */
export type WebhookLifecycleHook<TContext = WebhookLifecycleContext> = (
  context: TContext,
) => Promise<WebhookLifecycleResult | null | undefined> | WebhookLifecycleResult | null | undefined

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Webhook invocation mode - determines how responses are handled.
 * - WEBHOOK: Fire-and-forget. Returns 200 immediately, processes asynchronously.
 * - CALLBACK: Waits for handler response and returns it to the caller (e.g., voice XML).
 */
export type WebhookInvocationMode = 'WEBHOOK' | 'CALLBACK'

/**
 * @deprecated Use WebhookInvocationMode instead.
 */
export type WebhookType = WebhookInvocationMode

// ─────────────────────────────────────────────────────────────────────────────
// Expiring registrations (leases)
// ─────────────────────────────────────────────────────────────────────────────

/** The registration the platform asks the app to renew. */
export interface WebhookRenewRegistration {
  /** Registration id (the token in the URL) */
  id: string
  /** Handler name, the key in the webhook registry */
  name: string
  /** Public URL the provider calls. It stays the same across renewals. */
  url: string
  /** Context passed to webhook.create / webhook.update */
  context: Record<string, unknown> | null
  /** Current expiry (ISO) */
  expiresAt: string | null
}

export interface WebhookRenewContext {
  registration: WebhookRenewRegistration
  env: Record<string, string | undefined>
  app: AppInfo
  appInstallationId: string
  workplace: WorkplaceInfo
  invocation?: InvocationContext
  log: ContextLogger
}

/**
 * What a renew handler returns:
 * - `{ expiresAt }`: the provider subscription was renewed; the platform stores
 *   the new expiry (and `context`, when given) and renews again before it.
 *   `expiresAt: null` means it no longer expires, so renewal stops.
 * - `{ delete: true }`: the subscription is no longer needed; the platform
 *   deletes the registration.
 */
export type WebhookRenewResult =
  | { expiresAt: string | null; context?: Record<string, unknown> }
  | { delete: true }

export type WebhookRenewHandler = (
  context: WebhookRenewContext,
) => Promise<WebhookRenewResult>

export interface WebhookDefinition {
  name: string
  description: string
  /** HTTP methods this webhook accepts. Defaults to ['POST'] */
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[]
  /**
   * Invocation mode. Defaults to 'WEBHOOK' (fire-and-forget).
   * Use 'CALLBACK' when the caller expects the handler's response (e.g., voice XML).
   */
  type?: WebhookInvocationMode
  handler: WebhookHandler
  /**
   * Renews an expiring provider subscription that points at a registration of
   * this webhook. The platform calls it shortly before a registration created
   * with `autoRenew: true` expires (see webhook.create / webhook.update).
   */
  renew?: WebhookRenewHandler

  // App lifecycle
  onAppInstalled?: WebhookLifecycleHook
  onAppUninstalled?: WebhookLifecycleHook

  // Version lifecycle
  onAppVersionProvisioned?: WebhookLifecycleHook
  onAppVersionDeprovisioned?: WebhookLifecycleHook

  // Communication channel lifecycle
  onCommunicationChannelCreated?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
  onCommunicationChannelUpdated?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
  onCommunicationChannelDeleted?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
}

export type WebhookRegistry = Record<string, WebhookDefinition>

export type WebhookName<T extends WebhookRegistry> = Extract<keyof T, string>

export interface WebhookMetadata {
  name: string
  description: string
  methods: string[]
  type: WebhookInvocationMode
}
