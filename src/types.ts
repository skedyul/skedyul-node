import type { CoreApiConfig } from './core/types'
import type { z } from 'zod'
import type { PageFieldType } from './schemas'

export interface ToolContext {
  env: Record<string, string | undefined>
  mode?: 'execute' | 'estimate'
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Handler Context Types
// ─────────────────────────────────────────────────────────────────────────────

/** Context passed to field change handlers */
export interface FieldChangeContext extends ToolContext {
  /** Field handle from page definition */
  fieldHandle: string
  /** Field datatype */
  fieldType: PageFieldType
  /** Page handle */
  pageHandle: string
  /** App installation ID */
  appInstallationId: string
  /** Workplace info */
  workplace: { id: string; subdomain: string }
}

/** Parameters for field change handlers */
export interface FieldChangeParams<T = unknown> {
  /** The new value */
  value: T
  /** Previous value if available */
  previousValue?: T
  /** Handler context */
  context: FieldChangeContext
}

/** Context passed to page action handlers */
export interface PageActionContext extends ToolContext {
  /** Page handle */
  pageHandle: string
  /** App installation ID */
  appInstallationId: string
  /** Workplace info */
  workplace: { id: string; subdomain: string }
  /** All current field values on the page */
  fieldValues: Record<string, unknown>
}

/** Parameters for page action handlers */
export interface PageActionParams {
  /** Handler context */
  context: PageActionContext
}

/**
 * @deprecated Use ToolExecutionContext instead. This will be removed in a future version.
 */
export interface ToolParams<Input, Output> {
  input: Input
  context: ToolContext
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Context (Standardized)
// ─────────────────────────────────────────────────────────────────────────────

/** Trigger types for tool execution */
export type ToolTrigger = 'field_change' | 'page_action' | 'agent' | 'workflow' | 'form_submit'

/** Field info when tool is triggered by a field change */
export interface ToolFieldContext {
  /** Field handle from page definition */
  handle: string
  /** Field datatype */
  type: string
  /** Page handle where the field is defined */
  pageHandle: string
}

/**
 * Standardized execution context passed to all tool handlers.
 * This is injected by the runtime and contains metadata about how the tool was invoked.
 */
export interface ToolExecutionContext {
  /** How the tool was triggered */
  trigger: ToolTrigger
  /** App installation ID for scoping instance operations */
  appInstallationId?: string
  /** Workplace info */
  workplace?: { id: string; subdomain?: string }
  /** Field info (only present for field_change trigger) */
  field?: ToolFieldContext
  /** All current field values on the page (only for page_action trigger) */
  fieldValues?: Record<string, unknown>
  /** Path parameters from URL (e.g., from /phone-numbers/[phone_id]/overview) */
  params?: Record<string, string>
  /** Environment variables */
  env: Record<string, string | undefined>
  /** Execution mode - 'estimate' returns billing info without side effects */
  mode: 'execute' | 'estimate'
}

export interface BillingInfo {
  credits: number
}

/**
 * Client-side effects that the tool wants the UI to execute.
 * These are separate from the data output and represent navigation/UI actions.
 */
export interface ToolEffect {
  /** URL to navigate to after the tool completes */
  redirect?: string
  // Future: toast, refresh, closeDialog, etc.
}

export interface ToolExecutionResult<Output = unknown> {
  output: Output
  billing: BillingInfo
  /** Optional client-side effects to execute */
  effect?: ToolEffect
}

export interface ToolSchemaWithJson<
  Schema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  zod: Schema
  jsonSchema?: Record<string, unknown>
}

export type ToolSchema<Schema extends z.ZodTypeAny = z.ZodTypeAny> =
  | Schema
  | ToolSchemaWithJson<Schema>

/**
 * Tool handler function signature.
 * Receives tool-specific input as first argument and standardized context as second.
 *
 * @param input - Tool-specific input data (validated against inputs schema)
 * @param context - Standardized execution context injected by runtime
 */
export type ToolHandler<Input, Output> = (
  input: Input,
  context: ToolExecutionContext,
) => Promise<ToolExecutionResult<Output>> | ToolExecutionResult<Output>

export interface ToolDefinition<
  Input = unknown,
  Output = unknown,
  InputSchema extends z.ZodTypeAny = z.ZodType<Input>,
  OutputSchema extends z.ZodTypeAny = z.ZodType<Output>,
> {
  name: string
  description: string
  inputs: ToolSchema<InputSchema>
  handler: ToolHandler<Input, Output>
  outputSchema?: ToolSchema<OutputSchema>
  [key: string]: unknown // Allow additional properties
}

export interface ToolRegistryEntry {
  name: string
  description: string
  inputs: ToolSchema
  handler: unknown
  outputSchema?: ToolSchema
  [key: string]: unknown
}

export type ToolRegistry = Record<string, ToolRegistryEntry>

export type ToolName<T extends ToolRegistry> = Extract<keyof T, string>

export interface ToolMetadata {
  name: string
  description: string
  /**
   * JSON Schema describing the tool's inputs, as returned by Zod v4's z.toJSONSchema().
   * This is intentionally loose to support arbitrary JSON Schema shapes.
   */
  inputSchema?: Record<string, unknown>
  /**
   * Optional JSON Schema describing the tool's output, if provided.
   */
  outputSchema?: Record<string, unknown>
}

export interface HealthStatus {
  status: 'running'
  requests: number
  maxRequests: number | null
  requestsRemaining: number | null
  lastRequestTime: number
  ttlExtendSeconds: number
  runtime: string
  tools: string[]
}

export type ComputeLayer = 'dedicated' | 'serverless'

export interface ServerMetadata {
  name: string
  version: string
}

export interface CorsOptions {
  allowOrigin?: string
  allowMethods?: string
  allowHeaders?: string
}

export interface SkedyulServerConfig {
  computeLayer: ComputeLayer
  metadata: ServerMetadata
  defaultPort?: number
  maxRequests?: number | null
  ttlExtendSeconds?: number
  cors?: CorsOptions
  coreApi?: CoreApiConfig
}

export interface APIGatewayProxyEvent {
  body: string | null
  headers: Record<string, string>
  httpMethod: string
  path: string
  queryStringParameters: Record<string, string> | null
  requestContext: {
    requestId: string
  }
}

export interface APIGatewayProxyResult {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

export interface ToolCallResponse {
  output: unknown
  billing: BillingInfo
  error?: string
  effect?: ToolEffect
}

export interface DedicatedServerInstance {
  listen(port?: number): Promise<void>
  getHealthStatus(): HealthStatus
}

export interface ServerlessServerInstance {
  handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>
  getHealthStatus(): HealthStatus
}

export type SkedyulServerInstance =
  | DedicatedServerInstance
  | ServerlessServerInstance

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Types
// ─────────────────────────────────────────────────────────────────────────────

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

export interface WebhookContext {
  /** Environment variables available during webhook handling */
  env: Record<string, string | undefined>

  // ─────────────────────────────────────────────────────────────────────────
  // Platform-Injected Context (for registration-based webhooks)
  // These are populated when the platform forwards a WebhookRegistration request
  // ─────────────────────────────────────────────────────────────────────────

  /** App installation ID (null for provision-level webhooks) */
  appInstallationId?: string | null
  /** Workplace info (null for provision-level webhooks) */
  workplace?: { id: string; subdomain: string | null } | null
  /** Registration metadata passed when webhook.create() was called */
  registration?: Record<string, unknown>
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
  /** External ID from the provider (e.g., Twilio phone number SID) */
  externalId: string
  /** Optional message describing what was configured */
  message?: string
  /** Optional metadata from the provider */
  metadata?: Record<string, unknown>
}

/**
 * Lifecycle hook for webhook operations.
 * Return null if the API doesn't support programmatic management
 * (user must configure manually).
 */
export type WebhookLifecycleHook<TContext = WebhookLifecycleContext> = (
  context: TContext,
) =>
  | Promise<WebhookLifecycleResult | null | undefined>
  | WebhookLifecycleResult
  | null
  | undefined

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookDefinition {
  name: string
  description: string
  /** HTTP methods this webhook accepts. Defaults to ['POST'] */
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[]
  handler: WebhookHandler

  // App lifecycle
  /** Called when the app is installed to a workplace. Return null if manual setup required. */
  onAppInstalled?: WebhookLifecycleHook
  /** Called when the app is uninstalled from a workplace. Return null if manual cleanup required. */
  onAppUninstalled?: WebhookLifecycleHook

  // Version lifecycle (webhook URL changes)
  /** Called when a new app version is provisioned. Return null if manual setup required. */
  onAppVersionProvisioned?: WebhookLifecycleHook
  /** Called when an app version is deprovisioned. Return null if manual cleanup required. */
  onAppVersionDeprovisioned?: WebhookLifecycleHook

  // Communication channel lifecycle (knows which phone number/email/etc)
  /** Called when a communication channel is created. Return null if manual setup required. */
  onCommunicationChannelCreated?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
  /** Called when a communication channel is updated. Return null if manual update required. */
  onCommunicationChannelUpdated?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
  /** Called when a communication channel is deleted. Return null if manual cleanup required. */
  onCommunicationChannelDeleted?: WebhookLifecycleHook<CommunicationChannelLifecycleContext>
}

export type WebhookRegistry = Record<string, WebhookDefinition>

export type WebhookName<T extends WebhookRegistry> = Extract<keyof T, string>

export interface WebhookMetadata {
  name: string
  description: string
  methods: string[]
}

