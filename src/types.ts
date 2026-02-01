import type { CoreApiConfig } from './core/types'
import type { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

/** App info - always present in all contexts */
export interface AppInfo {
  id: string
  versionId: string
}

/** Workplace info - present in runtime contexts */
export interface WorkplaceInfo {
  id: string
  subdomain: string
}

/** Request info - present in runtime contexts */
export interface RequestInfo {
  url: string
  params: Record<string, string>
  query: Record<string, string>
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Context
// ─────────────────────────────────────────────────────────────────────────────

/** Trigger types for tool execution */
export type ToolTrigger = 'provision' | 'field_change' | 'page_action' | 'form_submit' | 'agent' | 'workflow'

/** Base context shared by all tool executions */
interface BaseToolContext {
  /** Environment variables */
  env: Record<string, string | undefined>
  /** Execution mode - 'estimate' returns billing info without side effects */
  mode: 'execute' | 'estimate'
  /** App info - always present */
  app: AppInfo
}

/** Provision context - no installation, no workplace */
export interface ProvisionToolContext extends BaseToolContext {
  trigger: 'provision'
}

/** Runtime base - has installation, workplace, request */
interface RuntimeToolContext extends BaseToolContext {
  appInstallationId: string
  workplace: WorkplaceInfo
  request: RequestInfo
}

/** Field change context */
export interface FieldChangeToolContext extends RuntimeToolContext {
  trigger: 'field_change'
  field: {
    handle: string
    type: string
    pageHandle: string
    value: unknown
    previousValue?: unknown
  }
}

/** Page action context */
export interface PageActionToolContext extends RuntimeToolContext {
  trigger: 'page_action'
  page: {
    handle: string
    values: Record<string, unknown>
  }
}

/** Form submit context */
export interface FormSubmitToolContext extends RuntimeToolContext {
  trigger: 'form_submit'
  form: {
    handle: string
    values: Record<string, unknown>
  }
}

/** Agent-triggered context */
export interface AgentToolContext extends RuntimeToolContext {
  trigger: 'agent'
}

/** Workflow-triggered context */
export interface WorkflowToolContext extends RuntimeToolContext {
  trigger: 'workflow'
}

/** Discriminated union of all tool execution contexts */
export type ToolExecutionContext =
  | ProvisionToolContext
  | FieldChangeToolContext
  | PageActionToolContext
  | FormSubmitToolContext
  | AgentToolContext
  | WorkflowToolContext

/** Type guard for provision context */
export function isProvisionContext(ctx: ToolExecutionContext): ctx is ProvisionToolContext {
  return ctx.trigger === 'provision'
}

/** Type guard for runtime context (any non-provision trigger) */
export function isRuntimeContext(
  ctx: ToolExecutionContext,
): ctx is FieldChangeToolContext | PageActionToolContext | FormSubmitToolContext | AgentToolContext | WorkflowToolContext {
  return ctx.trigger !== 'provision'
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input type for Provision lifecycle tools (onProvision, onDeprovision).
 * These tools receive no user input - all data comes from context.
 */
export type ProvisionToolInput = Record<string, never>

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
}

export interface ToolExecutionResult<Output = unknown> {
  output: Output
  billing: BillingInfo
  /** Optional client-side effects to execute */
  effect?: ToolEffect
}

export interface ToolSchemaWithJson<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  zod: Schema
  jsonSchema?: Record<string, unknown>
}

export type ToolSchema<Schema extends z.ZodTypeAny = z.ZodTypeAny> = Schema | ToolSchemaWithJson<Schema>

/**
 * Tool handler function signature.
 * Receives tool-specific input as first argument and standardized context as second.
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
  inputSchema: ToolSchema<InputSchema>
  handler: ToolHandler<Input, Output>
  outputSchema?: ToolSchema<OutputSchema>
  [key: string]: unknown
}

export interface ToolRegistryEntry {
  name: string
  description: string
  inputSchema: ToolSchema
  handler: unknown
  outputSchema?: ToolSchema
  [key: string]: unknown
}

export type ToolRegistry = Record<string, ToolRegistryEntry>

export type ToolName<T extends ToolRegistry> = Extract<keyof T, string>

export interface ToolMetadata {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Types
// ─────────────────────────────────────────────────────────────────────────────

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

export type SkedyulServerInstance = DedicatedServerInstance | ServerlessServerInstance

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

/** Base webhook context */
interface BaseWebhookContext {
  /** Environment variables */
  env: Record<string, string | undefined>
  /** App info */
  app: AppInfo
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
  /** External ID from the provider (e.g., Twilio phone number SID) */
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
 * Webhook invocation type - determines how responses are handled.
 * - WEBHOOK: Fire-and-forget. Returns 200 immediately, processes asynchronously.
 * - CALLBACK: Waits for handler response and returns it to the caller (e.g., Twilio TwiML).
 */
export type WebhookType = 'WEBHOOK' | 'CALLBACK'

export interface WebhookDefinition {
  name: string
  description: string
  /** HTTP methods this webhook accepts. Defaults to ['POST'] */
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[]
  /**
   * Invocation type. Defaults to 'WEBHOOK' (fire-and-forget).
   * Use 'CALLBACK' when the caller expects the handler's response (e.g., Twilio TwiML).
   */
  type?: WebhookType
  handler: WebhookHandler

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
  type: WebhookType
}
