import { AsyncLocalStorage } from 'async_hooks'
import type { CommunicationChannel, Workplace } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Normalized Response Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error object in normalized API responses.
 */
export interface CoreApiError {
  field: string | null
  code: string
  message: string
}

/**
 * Pagination info for list results.
 */
export interface InstancePagination {
  page: number
  total: number
  hasMore: boolean
  limit: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

type ClientConfig = {
  /** Base URL for the Skedyul Core API (e.g., "https://app.skedyul.com/api") */
  baseUrl: string
  /** API token (sk_app_* for App API or sk_wkp_* for Workplace API) */
  apiToken: string
}

/**
 * AsyncLocalStorage for request-scoped configuration.
 * This allows each request to have its own config without affecting other concurrent requests.
 */
const requestConfigStorage = new AsyncLocalStorage<ClientConfig>()

/**
 * Global configuration fallback (set at module load or via configure()).
 */
let globalConfig: ClientConfig = {
  baseUrl: process.env.SKEDYUL_API_URL ?? process.env.SKEDYUL_NODE_URL ?? '',
  apiToken: process.env.SKEDYUL_API_TOKEN ?? '',
}

/**
 * Run a function with request-scoped configuration.
 * The configuration is isolated to this async context and won't affect other requests.
 *
 * @example
 * ```ts
 * const result = await runWithConfig(
 *   { baseUrl: 'https://api.skedyul.com', apiToken: 'sk_xxx' },
 *   async () => {
 *     // All SDK calls in here use the scoped config
 *     return await instance.list('model', ctx);
 *   }
 * );
 * ```
 */
export function runWithConfig<T>(config: ClientConfig, fn: () => T): T {
  return requestConfigStorage.run(config, fn)
}

/**
 * Get the effective configuration for the current context.
 * Request-scoped config takes precedence over global config.
 */
function getEffectiveConfig(): ClientConfig {
  // Check for request-scoped config first
  const requestConfig = requestConfigStorage.getStore()
  if (requestConfig?.baseUrl && requestConfig?.apiToken) {
    return requestConfig
  }
  // Fall back to global config
  return globalConfig
}

/**
 * Configure the Skedyul client globally.
 *
 * Can be called to override environment variables, or to set config at runtime.
 * Note: For multi-tenant scenarios, prefer using runWithConfig() for request-scoped config.
 *
 * @example
 * ```ts
 * import { configure } from 'skedyul';
 *
 * configure({
 *   baseUrl: 'https://app.skedyul.com/api',
 *   apiToken: 'sk_app_xxxxx',
 * });
 * ```
 */
export function configure(options: Partial<ClientConfig>): void {
  globalConfig = {
    ...globalConfig,
    ...options,
  }
}

/**
 * Get the current client configuration.
 * Returns the effective config (request-scoped if available, otherwise global).
 */
export function getConfig(): Readonly<ClientConfig> {
  return getEffectiveConfig()
}

// ─────────────────────────────────────────────────────────────────────────────
// Core API Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result from callCore with normalized response envelope.
 */
interface CallCoreResult<T> {
  data: T
  errors: CoreApiError[]
  pagination?: InstancePagination
}

/**
 * Call the Core API with the normalized response envelope format.
 * Throws if success is false, otherwise returns unwrapped data.
 */
async function callCore<T>(
  method: string,
  params?: Record<string, unknown>,
): Promise<CallCoreResult<T>> {
  const effectiveConfig = getEffectiveConfig()
  const { baseUrl, apiToken } = effectiveConfig

  if (!baseUrl) {
    throw new Error(
      'Skedyul client not configured: missing baseUrl. Set SKEDYUL_API_URL environment variable or call configure().',
    )
  }

  if (!apiToken) {
    throw new Error(
      'Skedyul client not configured: missing apiToken. Set SKEDYUL_API_TOKEN environment variable or call configure().',
    )
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiToken}`,
  }

  const fetchUrl = `${baseUrl}/core`

  const response = await fetch(fetchUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method, params }),
  })

  // Check content-type before parsing
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    console.error(`[skedyul-node] Core API error: ${response.status} - ${text.slice(0, 200)}`)
    throw new Error(`Core API returned non-JSON response (${response.status}): ${text.slice(0, 100)}`)
  }

  const payload = (await response.json()) as {
    success: boolean
    data: T
    errors: CoreApiError[]
    pagination?: InstancePagination
  }

  // Handle failure responses
  if (!payload.success) {
    const message = payload.errors
      ?.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .join('; ') || 'Unknown error'
    throw new Error(message)
  }

  // Also handle HTTP errors (fallback for non-envelope errors)
  if (!response.ok) {
    throw new Error(`Core API error (${response.status})`)
  }

  return {
    data: payload.data,
    errors: payload.errors ?? [],
    pagination: payload.pagination,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Clients
// ─────────────────────────────────────────────────────────────────────────────

type ListArgs = {
  filter?: Record<string, unknown>
  limit?: number
}

export const workplace = {
  async list(args?: ListArgs): Promise<Workplace[]> {
    const { data } = await callCore<Workplace[]>('workplace.list', {
      ...(args?.filter ? { filter: args.filter } : {}),
      ...(args?.limit ? { limit: args.limit } : {}),
    })
    return data
  },

  async get(id: string): Promise<Workplace> {
    const { data } = await callCore<Workplace>('workplace.get', { id })
    return data
  },
}

export interface CreateMessageAttachment {
  fileId: string
  name: string
  mimeType: string
  size: number
}

export interface CreateMessageType {
  id?: string | null
  remoteId?: string | null
  message: string
  title?: string | null
  contentRaw?: string | null
  newChat?: boolean
  attachments?: CreateMessageAttachment[]
}

export interface ReceiveMessageContact {
  id?: string
  identifierValue?: string
}

export interface ReceiveMessageInput {
  /** Communication channel ID */
  communicationChannelId: string
  /** Sender's identifier (e.g., phone number, email) */
  from: string
  /** Message payload */
  message: CreateMessageType
  /** Optional contact metadata to associate the message */
  contact?: ReceiveMessageContact
  /** Optional remote/external message ID (e.g., Twilio MessageSid) */
  remoteId?: string
}

export const communicationChannel = {
  /**
   * List communication channels with optional filters.
   *
   * @example
   * ```ts
   * // Find channel by phone number
   * const channels = await communicationChannel.list({
   *   filter: { identifierValue: '+1234567890' },
   *   limit: 1,
   * });
   * ```
   */
  async list(args?: ListArgs): Promise<CommunicationChannel[]> {
    const { data } = await callCore<CommunicationChannel[]>('communicationChannel.list', {
      ...(args?.filter ? { filter: args.filter } : {}),
      ...(args?.limit ? { limit: args.limit } : {}),
    })
    return data
  },

  async get(id: string): Promise<CommunicationChannel | null> {
    const { data } = await callCore<CommunicationChannel | null>('communicationChannel.get', { id })
    return data
  },

  /**
   * Receive an inbound message on a communication channel.
   *
   * This is typically called from webhook handlers to process incoming messages
   * (e.g., SMS from Twilio, emails, WhatsApp messages).
   *
   * @example
   * ```ts
   * // In a webhook handler
   * const result = await communicationChannel.receiveMessage({
   *   communicationChannelId: channel.id,
   *   from: '+1234567890',
   *   message: 'Hello!',
   *   remoteId: 'twilio-message-sid-123',
   * });
   * ```
   */
  async receiveMessage(
    input: ReceiveMessageInput,
  ): Promise<{ messageId: string }> {
    const { data } = await callCore<{ messageId: string }>('communicationChannel.receiveMessage', {
      communicationChannelId: input.communicationChannelId,
      from: input.from,
      message: input.message,
      contact: input.contact,
      ...(input.remoteId ? { remoteId: input.remoteId } : {}),
    })
    return data
  },

  /**
   * Remove a communication channel and its associated resources.
   *
   * Deletes the channel and cascades:
   * - EnvVariables scoped to this channel
   * - AppFields scoped to this channel
   * - AppResourceInstances scoped to this channel
   * - CommunicationChannelSubscriptions (Prisma cascade)
   *
   * ChatMessages are preserved with subscriptionId set to null.
   *
   * @example
   * ```ts
   * const { success } = await communicationChannel.remove('channel-id-123')
   * ```
   */
  async remove(channelId: string): Promise<{ success: boolean }> {
    const { data } = await callCore<{ success: boolean }>('communicationChannel.remove', {
      communicationChannelId: channelId,
    })
    return data
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context required for instance operations.
 * This is typically extracted from the tool handler's context.
 */
export interface InstanceContext {
  /** The app installation ID for scoping */
  appInstallationId: string
  /** Workplace info */
  workplace: { id: string }
}

/**
 * Metadata for an instance.
 */
export interface InstanceMeta {
  modelId: string
  label?: string
}

/**
 * Instance data returned from the API.
 * Contains field handles as keys with their values.
 */
export interface InstanceData {
  id: string
  _meta: InstanceMeta
  [fieldHandle: string]: unknown
}

/**
 * Result from instance.list().
 */
export interface InstanceListResult {
  data: InstanceData[]
  pagination: InstancePagination
}

/**
 * Arguments for instance.list().
 */
export interface InstanceListArgs {
  page?: number
  limit?: number
  /** Filter conditions. Simple format { field: value } or structured { field: { eq: value } } */
  filter?: Record<string, unknown>
}

export const instance = {
  /**
   * List instances of an internal model.
   *
   * **Behavior based on context:**
   * - With ctx (appInstallationId): scoped to that installation
   * - Without ctx + sk_app_ token: searches across ALL installations for the app
   *
   * @example
   * ```ts
   * // Scoped to a specific installation (in tool handlers)
   * const ctx = {
   *   appInstallationId: context.appInstallationId,
   *   workplace: context.workplace,
   * }
   * const { data, pagination } = await instance.list('compliance_record', ctx, {
   *   page: 1,
   *   limit: 10,
   * })
   *
   * // Cross-installation search (in webhooks with sk_app_ token)
   * const { data } = await instance.list('phone_number', undefined, {
   *   filter: { phone: '+1234567890' },
   * })
   * if (data.length > 0) {
   *   const { appInstallationId } = data[0]
   *   const { token: scopedToken } = await token.exchange(appInstallationId)
   * }
   * ```
   */
  async list(
    modelHandle: string,
    ctx?: InstanceContext,
    args?: InstanceListArgs,
  ): Promise<InstanceListResult> {
    const { data, pagination } = await callCore<InstanceData[]>('instance.list', {
      modelHandle,
      ...(ctx?.appInstallationId ? { appInstallationId: ctx.appInstallationId } : {}),
      ...(ctx?.workplace?.id ? { workplaceId: ctx.workplace.id } : {}),
      ...(args?.page !== undefined ? { page: args.page } : {}),
      ...(args?.limit !== undefined ? { limit: args.limit } : {}),
      ...(args?.filter ? { filter: args.filter } : {}),
    })
    return {
      data,
      pagination: pagination ?? { page: 1, total: 0, hasMore: false, limit: args?.limit ?? 50 },
    }
  },

  /**
   * Get a single instance by ID.
   *
   * @example
   * ```ts
   * const record = await instance.get('instance-id-123', ctx)
   * ```
   */
  async get(id: string, ctx: InstanceContext): Promise<InstanceData | null> {
    const { data } = await callCore<InstanceData | null>('instance.get', {
      id,
      appInstallationId: ctx.appInstallationId,
      workplaceId: ctx.workplace.id,
    })
    return data
  },

  /**
   * Create a new instance of an internal model.
   *
   * @example
   * ```ts
   * const newRecord = await instance.create('compliance_record', {
   *   status: 'pending',
   *   document_url: 'https://...',
   * }, ctx)
   * ```
   */
  async create(
    modelHandle: string,
    data: Record<string, unknown>,
    ctx: InstanceContext,
  ): Promise<InstanceData> {
    const { data: instance } = await callCore<InstanceData>('instance.create', {
      modelHandle,
      appInstallationId: ctx.appInstallationId,
      workplaceId: ctx.workplace.id,
      data,
    })
    return instance
  },

  /**
   * Update an existing instance.
   *
   * @example
   * ```ts
   * const updated = await instance.update('instance-id-123', {
   *   status: 'approved',
   *   bundle_sid: 'BU123456',
   * }, ctx)
   * ```
   */
  async update(
    id: string,
    data: Record<string, unknown>,
    ctx: InstanceContext,
  ): Promise<InstanceData> {
    const { data: instance } = await callCore<InstanceData>('instance.update', {
      id,
      appInstallationId: ctx.appInstallationId,
      workplaceId: ctx.workplace.id,
      data,
    })
    return instance
  },

  /**
   * Delete an existing instance.
   *
   * @example
   * ```ts
   * const { deleted } = await instance.delete('instance-id-123', ctx)
   * ```
   */
  async delete(
    id: string,
    ctx: InstanceContext,
  ): Promise<{ deleted: boolean }> {
    const { data } = await callCore<{ deleted: boolean }>('instance.delete', {
      id,
      appInstallationId: ctx.appInstallationId,
      workplaceId: ctx.workplace.id,
    })
    return data
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Client
// ─────────────────────────────────────────────────────────────────────────────

export const token = {
  /**
   * Exchange an sk_app_ token for an installation-scoped sk_wkp_ JWT.
   *
   * **Requires sk_app_ token** - only works with app-level tokens.
   * Used after identifying the target installation (e.g., via instance.search).
   *
   * The returned JWT is short-lived (1 hour) and scoped to the specific installation.
   *
   * @example
   * ```ts
   * // After finding the installation via instance.search
   * const { token: scopedToken } = await token.exchange(appInstallationId)
   *
   * // Use the scoped token for subsequent operations
   * runWithConfig({ apiToken: scopedToken, baseUrl: config.baseUrl }, async () => {
   *   const channels = await communicationChannel.list({ filter: { identifierValue: phoneNumber } })
   *   // ...
   * })
   * ```
   */
  async exchange(appInstallationId: string): Promise<{ token: string }> {
    const { data } = await callCore<{ token: string }>('token.exchange', {
      appInstallationId,
    })
    return data
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// File Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Response from file.getUrl
 */
export interface FileUrlResponse {
  /** Presigned download URL (expires in 1 hour) */
  url: string
  /** ISO timestamp when the URL expires */
  expiresAt: string
}

export const file = {
  /**
   * Get a temporary download URL for an app-scoped file.
   *
   * Files are validated to ensure they belong to the requesting app installation.
   * The returned URL expires in 1 hour.
   *
   * @example
   * ```ts
   * // Get a download URL for a file
   * const { url, expiresAt } = await file.getUrl('fl_abc123')
   *
   * // Use the URL to download or pass to external services
   * const response = await fetch(url)
   * ```
   */
  async getUrl(fileId: string): Promise<FileUrlResponse> {
    const { data } = await callCore<FileUrlResponse>('file.getUrl', {
      fileId,
    })
    return data
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Response from webhook.create
 */
export interface WebhookCreateResult {
  /** Registration ID (whkr_xxx format) - used as the token in the URL */
  id: string
  /** Full public URL for external services to call */
  url: string
  /** ISO timestamp when the registration expires (null if no expiration) */
  expiresAt: string | null
}

/**
 * Webhook registration info returned from webhook.list
 */
export interface WebhookListItem {
  /** Registration ID */
  id: string
  /** Handler name from webhooks config */
  name: string
  /** Custom context passed to handler when webhook fires */
  context: Record<string, unknown> | null
  /** Full public URL */
  url: string
  /** ISO timestamp when the registration was created */
  createdAt: string
  /** ISO timestamp when the registration expires (null if no expiration) */
  expiresAt: string | null
}

/**
 * Options for webhook.deleteByName
 */
export interface WebhookDeleteByNameOptions {
  /** Filter registrations by context values */
  filter?: Record<string, unknown>
}

/**
 * Options for webhook.list
 */
export interface WebhookListOptions {
  /** Filter by handler name */
  name?: string
}

export const webhook = {
  /**
   * Create a webhook registration for a handler.
   *
   * Creates a unique URL that external services can call.
   * When called, the request is routed to the handler defined in webhooks config.
   *
   * **Requires sk_wkp_ token** - registrations are scoped to the app installation.
   *
   * @param name - Handler name from webhooks config
   * @param context - Optional metadata passed to the handler when webhook fires
   * @param options - Optional configuration (e.g., expiration)
   *
   * @example
   * ```ts
   * // Create a webhook for Twilio compliance callbacks
   * const { url, id } = await webhook.create('compliance_status', {
   *   bundleSid: bundle.sid,
   *   complianceRecordId: record.id,
   * })
   *
   * // Pass the URL to Twilio
   * await twilioClient.bundles(bundle.sid).update({
   *   statusCallback: url,
   * })
   * ```
   */
  async create(
    name: string,
    context?: Record<string, unknown>,
    options?: { expiresIn?: number },
  ): Promise<WebhookCreateResult> {
    const { data } = await callCore<WebhookCreateResult>('webhook.create', {
      name,
      ...(context ? { context } : {}),
      ...(options?.expiresIn ? { expiresIn: options.expiresIn } : {}),
    })
    return data
  },

  /**
   * Delete a webhook registration by ID.
   *
   * @param id - Registration ID (whkr_xxx format)
   * @returns Whether the registration was deleted (false if not found)
   *
   * @example
   * ```ts
   * const { deleted } = await webhook.delete('whkr_abc123')
   * ```
   */
  async delete(id: string): Promise<{ deleted: boolean }> {
    const { data } = await callCore<{ deleted: boolean }>('webhook.delete', {
      id,
    })
    return data
  },

  /**
   * Delete webhook registrations by handler name.
   *
   * Useful for cleaning up all webhooks of a certain type,
   * or filtering by context values.
   *
   * @param name - Handler name from webhooks config
   * @param options - Optional filter by context values
   * @returns Number of registrations deleted
   *
   * @example
   * ```ts
   * // Delete all receive_sms webhooks for this installation
   * const { count } = await webhook.deleteByName('receive_sms')
   *
   * // Delete only webhooks for a specific channel
   * const { count } = await webhook.deleteByName('receive_sms', {
   *   filter: { communicationChannelId: channel.id },
   * })
   * ```
   */
  async deleteByName(
    name: string,
    options?: WebhookDeleteByNameOptions,
  ): Promise<{ count: number }> {
    const { data } = await callCore<{ count: number }>('webhook.deleteByName', {
      name,
      ...(options?.filter ? { filter: options.filter } : {}),
    })
    return data
  },

  /**
   * List webhook registrations for this installation.
   *
   * @param options - Optional filter by handler name
   * @returns Array of webhook registrations
   *
   * @example
   * ```ts
   * // List all webhooks
   * const { webhooks } = await webhook.list()
   *
   * // List only receive_sms webhooks
   * const { webhooks } = await webhook.list({ name: 'receive_sms' })
   * ```
   */
  async list(options?: WebhookListOptions): Promise<{ webhooks: WebhookListItem[] }> {
    const { data } = await callCore<WebhookListItem[]>('webhook.list', {
      ...(options?.name ? { name: options.name } : {}),
    })
    return { webhooks: data }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for resource.link
 */
export interface ResourceLinkParams {
  /** SHARED model handle from provision config */
  handle: string
  /** User's model ID to link to */
  targetModelId: string
  /** Optional: scope to a communication channel */
  channelId?: string
}

/**
 * Result from resource.link
 */
export interface ResourceLinkResult {
  /** Created AppResourceInstance ID */
  instanceId: string
}

export const resource = {
  /**
   * Link a SHARED app resource (model) to a user's resource.
   *
   * Creates an AppResourceInstance hierarchy for MODEL types.
   * This establishes the connection between an app's SHARED model
   * (e.g., 'contact') and a user's actual workplace model (e.g., 'Clients').
   *
   * @param params - Link parameters
   * @param ctx - Instance context with appInstallationId and workplace
   *
   * @example
   * ```ts
   * // Link the SHARED 'contact' model to user's 'Clients' model
   * const { instanceId } = await resource.link({
   *   handle: 'contact',           // SHARED model handle from provision config
   *   targetModelId: modelId,      // User's selected model ID
   *   channelId: channel.id,       // Optional: scope to communication channel
   * }, ctx)
   * ```
   */
  async link(
    params: ResourceLinkParams,
    ctx: InstanceContext,
  ): Promise<ResourceLinkResult> {
    const { data } = await callCore<ResourceLinkResult>('resource.link', {
      appInstallationId: ctx.appInstallationId,
      workplaceId: ctx.workplace.id,
      ...params,
    })
    return data
  },
}
