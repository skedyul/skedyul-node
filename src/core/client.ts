import { AsyncLocalStorage } from 'async_hooks'
import { z } from 'zod/v4'
import type { CommunicationChannel, Workplace } from './types'
import type { StructuredFilter } from '../schemas'

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
  /** Base URL / origin for the Skedyul platform (e.g., "https://app.skedyul.com") */
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
 * Falls back to process.env for runtime-injected values.
 */
function getEffectiveConfig(): ClientConfig {
  // Check for request-scoped config first (AsyncLocalStorage)
  const requestConfig = requestConfigStorage.getStore()
  if (requestConfig?.baseUrl && requestConfig?.apiToken) {
    return requestConfig
  }
  
  // Check if global config has been explicitly set via configure()
  if (globalConfig.baseUrl && globalConfig.apiToken) {
    return globalConfig
  }
  
  // Fall back to process.env for runtime-injected values
  // This handles cases where env vars are set per-request (e.g., in tool handlers)
  // and AsyncLocalStorage context is lost across async boundaries
  return {
    baseUrl: process.env.SKEDYUL_API_URL ?? process.env.SKEDYUL_NODE_URL ?? globalConfig.baseUrl,
    apiToken: process.env.SKEDYUL_API_TOKEN ?? globalConfig.apiToken,
  }
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
 *   baseUrl: 'https://app.skedyul.com',
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

  const fetchUrl = `${baseUrl.replace(/\/+$/, '')}/api/core`

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

export interface ReceiveMessageGroup {
  externalGroupId?: string
  groupName?: string
}

export interface ReceiveMessageInput {
  /** Communication channel ID */
  communicationChannelId: string
  /** Sender's identifier (e.g., phone number, email) */
  from: string
  /** Receiver's identifier (defaults to channel identifierValue if not provided) */
  to?: string
  /** Message payload */
  message: CreateMessageType
  /** Optional contact metadata to associate the message */
  contact?: ReceiveMessageContact
  /** Optional group metadata (WhatsApp groups, etc.) */
  group?: ReceiveMessageGroup
  /** Optional remote/external message ID (e.g., Twilio MessageSid) */
  remoteId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Create Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for creating a communication channel.
 */
export interface ChannelCreateParams {
  /** Friendly name for the channel */
  name: string
  /** Unique identifier for the channel (e.g., phone number, email address) */
  identifierValue: string
  /** Optional: Link a SHARED model to user's model when creating the channel */
  link?: {
    /** SHARED model handle from provision config (e.g., 'contact') */
    handle: string
    /** User's model ID to link to */
    targetModelId: string
  }
}

/**
 * Result from creating a communication channel.
 */
export interface ChannelCreateResult {
  /** Created channel ID */
  id: string
  /** Channel name */
  name: string
  /** Channel handle from config */
  handle: string
  /** Channel identifier value */
  identifierValue: string
  /** AppResourceInstance ID if link was provided */
  resourceInstanceId?: string
}

export const communicationChannel = {
  /**
   * Create a communication channel for an app installation.
   *
   * Creates a channel with the given handle from provision.config.ts.
   * Optionally links a SHARED model to the user's model in a single operation.
   *
   * **Requires sk_wkp_ token** - channels are scoped to app installations.
   *
   * @param handle - Channel handle from provision.config.ts (e.g., "phone", "email")
   * @param params - Channel creation parameters
   *
   * @example
   * ```ts
   * // Create a phone channel and link the contact model
   * const channel = await communicationChannel.create("phone", {
   *   name: "Sales Line",
   *   identifierValue: "+61400000000",
   *   link: {
   *     handle: "contact",        // SHARED model from provision config
   *     targetModelId: modelId,   // User's selected model
   *   },
   * });
   * ```
   */
  async create(
    handle: string,
    params: ChannelCreateParams,
  ): Promise<ChannelCreateResult> {
    const { data } = await callCore<ChannelCreateResult>('communicationChannel.create', {
      handle,
      ...params,
    })
    return data
  },

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
      ...(input.to ? { to: input.to } : {}),
      message: input.message,
      contact: input.contact,
      ...(input.group ? { group: input.group } : {}),
      ...(input.remoteId ? { remoteId: input.remoteId } : {}),
    })
    return data
  },

  /**
   * Update a communication channel's properties.
   *
   * @param channelId - The ID of the channel to update
   * @param params - The properties to update (e.g., name)
   *
   * @example
   * ```ts
   * const channel = await communicationChannel.update('channel-id-123', {
   *   name: 'New Channel Name',
   * })
   * ```
   */
  async update(
    channelId: string,
    params: { name?: string },
  ): Promise<CommunicationChannel> {
    const { data } = await callCore<CommunicationChannel>('communicationChannel.update', {
      communicationChannelId: channelId,
      ...params,
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
  /** The app installation this instance belongs to (if any) */
  appInstallationId?: string | null
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
  /** Filter conditions using StructuredFilter format: { field: { operator: value } } */
  filter?: StructuredFilter
}

/**
 * Interface for instance operations.
 * 
 * Used by both the global `instance` export (uses current config) and
 * scoped clients returned by `token.exchange` (bound to specific sk_wkp_ token).
 */
export interface InstanceClient {
  list(modelHandle: string, args?: InstanceListArgs): Promise<InstanceListResult>
  get(modelHandle: string, id: string): Promise<InstanceData | null>
  create(modelHandle: string, data: Record<string, unknown>): Promise<InstanceData>
  update(modelHandle: string, id: string, data: Record<string, unknown>): Promise<InstanceData>
  delete(modelHandle: string, id: string): Promise<{ deleted: boolean }>
  deleteMany(modelHandle: string, options: { ids: string[] } | { filter: StructuredFilter }): Promise<{ deleted: string[]; errors: Array<{ index: number; error: string }> }>
  createMany(modelHandle: string, items: Record<string, unknown>[]): Promise<{ created: InstanceData[]; errors: Array<{ index: number; error: string }> }>
  updateMany(modelHandle: string, items: Array<{ id: string; data: Record<string, unknown> }>): Promise<{ updated: InstanceData[]; errors: Array<{ index: number; error: string }> }>
  upsertMany(modelHandle: string, items: Record<string, unknown>[], matchField: string): Promise<{ results: Array<InstanceData & { mode: 'created' | 'updated' }>; errors: Array<{ index: number; error: string }> }>
  isConfigured(modelHandle: string): Promise<boolean>
  getConfiguredModels(modelHandles: string[]): Promise<Map<string, boolean>>
}

/**
 * Create an instance client with a specific configuration.
 * 
 * This is useful for creating clients bound to specific tokens (e.g., from token.exchange).
 * All methods on the returned client use the provided configuration.
 * 
 * @param config - Client configuration with baseUrl and apiToken
 * @returns InstanceClient bound to the provided config
 * 
 * @example
 * ```ts
 * // After getting a scoped token via token.exchange
 * const scopedClient = createInstanceClient({
 *   baseUrl: getConfig().baseUrl,
 *   apiToken: scopedToken,
 * })
 * await scopedClient.create('studio', { ... })
 * ```
 */
export function createInstanceClient(config: ClientConfig): InstanceClient {
  // Helper to call core API with the provided config
  async function callCoreWithConfig<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<CallCoreResult<T>> {
    return runWithConfig(config, () => callCore<T>(method, params))
  }

  return {
    async list(modelHandle: string, args?: InstanceListArgs): Promise<InstanceListResult> {
      const { data, pagination } = await callCoreWithConfig<InstanceData[]>('instance.list', {
        modelHandle,
        ...(args?.page !== undefined ? { page: args.page } : {}),
        ...(args?.limit !== undefined ? { limit: args.limit } : {}),
        ...(args?.filter ? { filter: args.filter } : {}),
      })
      return {
        data,
        pagination: pagination ?? { page: 1, total: 0, hasMore: false, limit: args?.limit ?? 50 },
      }
    },

    async get(modelHandle: string, id: string): Promise<InstanceData | null> {
      const { data } = await callCoreWithConfig<InstanceData | null>('instance.get', {
        modelHandle,
        id,
      })
      return data
    },

    async create(modelHandle: string, data: Record<string, unknown>): Promise<InstanceData> {
      const { data: inst } = await callCoreWithConfig<InstanceData>('instance.create', {
        modelHandle,
        data,
      })
      return inst
    },

    async update(modelHandle: string, id: string, data: Record<string, unknown>): Promise<InstanceData> {
      const { data: inst } = await callCoreWithConfig<InstanceData>('instance.update', {
        modelHandle,
        id,
        data,
      })
      return inst
    },

    async delete(modelHandle: string, id: string): Promise<{ deleted: boolean }> {
      const { data } = await callCoreWithConfig<{ deleted: boolean }>('instance.delete', {
        modelHandle,
        id,
      })
      return data
    },

    async deleteMany(
      modelHandle: string,
      options: { ids: string[] } | { filter: StructuredFilter },
    ): Promise<{ deleted: string[]; errors: Array<{ index: number; error: string }> }> {
      const { data } = await callCoreWithConfig<{ deleted: string[]; errors: Array<{ index: number; error: string }> }>('instance.deleteMany', {
        modelHandle,
        ...options,
      })
      return data
    },

    async createMany(
      modelHandle: string,
      items: Record<string, unknown>[],
    ): Promise<{ created: InstanceData[]; errors: Array<{ index: number; error: string }> }> {
      const { data } = await callCoreWithConfig<{ created: InstanceData[]; errors: Array<{ index: number; error: string }> }>('instance.createMany', {
        modelHandle,
        items,
      })
      return data
    },

    async updateMany(
      modelHandle: string,
      items: Array<{ id: string; data: Record<string, unknown> }>,
    ): Promise<{ updated: InstanceData[]; errors: Array<{ index: number; error: string }> }> {
      const { data } = await callCoreWithConfig<{ updated: InstanceData[]; errors: Array<{ index: number; error: string }> }>('instance.updateMany', {
        modelHandle,
        items,
      })
      return data
    },

    async upsertMany(
      modelHandle: string,
      items: Record<string, unknown>[],
      matchField: string,
    ): Promise<{ results: Array<InstanceData & { mode: 'created' | 'updated' }>; errors: Array<{ index: number; error: string }> }> {
      const { data } = await callCoreWithConfig<{ results: Array<InstanceData & { mode: 'created' | 'updated' }>; errors: Array<{ index: number; error: string }> }>('instance.upsertMany', {
        modelHandle,
        items,
        matchField,
      })
      return data
    },

    async isConfigured(modelHandle: string): Promise<boolean> {
      const { data } = await callCoreWithConfig<{ configured: boolean }>('instance.isConfigured', {
        modelHandle,
      })
      return data.configured
    },

    async getConfiguredModels(modelHandles: string[]): Promise<Map<string, boolean>> {
      const { data } = await callCoreWithConfig<Record<string, boolean>>('instance.getConfiguredModels', {
        modelHandles,
      })
      return new Map(Object.entries(data))
    },
  }
}

export const instance: InstanceClient = {
  /**
   * List instances of an internal model.
   *
   * The API token determines the context:
   * - sk_wkp_ tokens: scoped to the token's app installation
   * - sk_app_ tokens: searches across ALL installations for the app
   *
   * @example
   * ```ts
   * // List with filters
   * const { data, pagination } = await instance.list('compliance_record', {
   *   filter: { status: 'pending' },
   *   page: 1,
   *   limit: 10,
   * })
   *
   * // Cross-installation search (with sk_app_ token)
   * const { data } = await instance.list('phone_number', {
   *   filter: { phone: '+1234567890' },
   * })
   * ```
   */
  async list(
    modelHandle: string,
    args?: InstanceListArgs,
  ): Promise<InstanceListResult> {
    const { data, pagination } = await callCore<InstanceData[]>('instance.list', {
      modelHandle,
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
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @example
   * ```ts
   * const record = await instance.get('phone_number', 'ins_abc123')
   * ```
   */
  async get(modelHandle: string, id: string): Promise<InstanceData | null> {
    const { data } = await callCore<InstanceData | null>('instance.get', {
      modelHandle,
      id,
    })
    return data
  },

  /**
   * Create a new instance of an internal model.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @example
   * ```ts
   * const newRecord = await instance.create('compliance_record', {
   *   status: 'pending',
   *   document_url: 'https://...',
   * })
   * ```
   */
  async create(
    modelHandle: string,
    data: Record<string, unknown>,
  ): Promise<InstanceData> {
    const { data: instance } = await callCore<InstanceData>('instance.create', {
      modelHandle,
      data,
    })
    return instance
  },

  /**
   * Update an existing instance.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @example
   * ```ts
   * const updated = await instance.update('compliance_record', 'ins_abc123', {
   *   status: 'approved',
   *   bundle_sid: 'BU123456',
   * })
   * ```
   */
  async update(
    modelHandle: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<InstanceData> {
    const { data: instance } = await callCore<InstanceData>('instance.update', {
      modelHandle,
      id,
      data,
    })
    return instance
  },

  /**
   * Delete an existing instance.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @example
   * ```ts
   * const { deleted } = await instance.delete('phone_number', 'ins_abc123')
   * ```
   */
  async delete(
    modelHandle: string,
    id: string,
  ): Promise<{ deleted: boolean }> {
    const { data } = await callCore<{ deleted: boolean }>('instance.delete', {
      modelHandle,
      id,
    })
    return data
  },

  /**
   * Delete multiple instances of an internal model in a single batch operation.
   *
   * This is more efficient than calling delete() multiple times as it reduces
   * API overhead and executes all deletes in a single transaction.
   *
   * Supports two modes:
   * - **By IDs**: Delete specific instances by their IDs
   * - **By Filter**: Delete instances matching a StructuredFilter
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @param modelHandle - The model handle from provision config
   * @param options - Either { ids: string[] } or { filter: StructuredFilter }
   * @returns Object containing deleted instance IDs and any errors that occurred
   *
   * @example
   * ```ts
   * // Delete by IDs
   * const { deleted, errors } = await instance.deleteMany('panel_result', {
   *   ids: ['ins_abc123', 'ins_def456'],
   * })
   *
   * // Delete by filter
   * const { deleted, errors } = await instance.deleteMany('panel_result', {
   *   filter: { status: { eq: 'pending' } },
   * })
   *
   * if (errors.length > 0) {
   *   console.log('Some items failed:', errors)
   * }
   * console.log('Deleted:', deleted.length, 'instances')
   * ```
   */
  async deleteMany(
    modelHandle: string,
    options: { ids: string[] } | { filter: StructuredFilter },
  ): Promise<{ deleted: string[]; errors: Array<{ index: number; error: string }> }> {
    const { data } = await callCore<{ deleted: string[]; errors: Array<{ index: number; error: string }> }>('instance.deleteMany', {
      modelHandle,
      ...options,
    })
    return data
  },

  /**
   * Create multiple instances of an internal model in a single batch operation.
   *
   * This is more efficient than calling create() multiple times as it reduces
   * API overhead and executes all creates in a single transaction.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @param modelHandle - The model handle from provision config
   * @param items - Array of data objects to create as instances
   * @returns Object containing created instances and any errors that occurred
   *
   * @example
   * ```ts
   * const { created, errors } = await instance.createMany('panel_result', [
   *   { test_name: 'Glucose', value_string: '5.2', unit: 'mmol/L' },
   *   { test_name: 'Creatinine', value_string: '80', unit: 'umol/L' },
   * ])
   *
   * if (errors.length > 0) {
   *   console.log('Some items failed:', errors)
   * }
   * console.log('Created:', created.length, 'instances')
   * ```
   */
  async createMany(
    modelHandle: string,
    items: Record<string, unknown>[],
  ): Promise<{ created: InstanceData[]; errors: Array<{ index: number; error: string }> }> {
    const { data } = await callCore<{ created: InstanceData[]; errors: Array<{ index: number; error: string }> }>('instance.createMany', {
      modelHandle,
      items,
    })
    return data
  },

  /**
   * Update multiple instances of an internal model in a single batch operation.
   *
   * This is more efficient than calling update() multiple times as it reduces
   * API overhead and executes all updates in a single transaction.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @param modelHandle - The model handle from provision config
   * @param items - Array of objects containing id and data to update
   * @returns Object containing updated instances and any errors that occurred
   *
   * @example
   * ```ts
   * const { updated, errors } = await instance.updateMany('panel_result', [
   *   { id: 'ins_abc123', data: { value_string: '5.5' } },
   *   { id: 'ins_def456', data: { value_string: '85' } },
   * ])
   *
   * if (errors.length > 0) {
   *   console.log('Some items failed:', errors)
   * }
   * console.log('Updated:', updated.length, 'instances')
   * ```
   */
  async updateMany(
    modelHandle: string,
    items: Array<{ id: string; data: Record<string, unknown> }>,
  ): Promise<{ updated: InstanceData[]; errors: Array<{ index: number; error: string }> }> {
    const { data } = await callCore<{ updated: InstanceData[]; errors: Array<{ index: number; error: string }> }>('instance.updateMany', {
      modelHandle,
      items,
    })
    return data
  },

  /**
   * Upsert multiple instances of an internal model in a single batch operation.
   *
   * Creates instances if they don't exist, updates them if they do (based on matchField).
   * This is more efficient than calling upsert() multiple times as it reduces
   * API overhead and executes all upserts in a single transaction.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @param modelHandle - The model handle from provision config
   * @param items - Array of data objects to upsert as instances
   * @param matchField - The field handle to match existing instances (e.g., 'vetnostics_id')
   * @returns Object containing upserted instances with mode and any errors that occurred
   *
   * @example
   * ```ts
   * const { results, errors } = await instance.upsertMany('panel_result', [
   *   { vetnostics_id: '25-54966975/622/glucose', test_name: 'Glucose', value_string: '5.2' },
   *   { vetnostics_id: '25-54966975/622/creatinine', test_name: 'Creatinine', value_string: '80' },
   * ], 'vetnostics_id')
   *
   * if (errors.length > 0) {
   *   console.log('Some items failed:', errors)
   * }
   * const created = results.filter(r => r.mode === 'created')
   * const updated = results.filter(r => r.mode === 'updated')
   * console.log('Created:', created.length, 'Updated:', updated.length)
   * ```
   */
  async upsertMany(
    modelHandle: string,
    items: Record<string, unknown>[],
    matchField: string,
  ): Promise<{ results: Array<InstanceData & { mode: 'created' | 'updated' }>; errors: Array<{ index: number; error: string }> }> {
    const { data } = await callCore<{ results: Array<InstanceData & { mode: 'created' | 'updated' }>; errors: Array<{ index: number; error: string }> }>('instance.upsertMany', {
      modelHandle,
      items,
      matchField,
    })
    return data
  },

  /**
   * Check if a model is configured (linked) for the current app installation.
   *
   * This is useful for best-effort sync scenarios where you want to check
   * which models are available before attempting to create instances.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @param modelHandle - The model handle from provision config
   * @returns true if the model is configured and has a valid targetId, false otherwise
   *
   * @example
   * ```ts
   * // Check if models are configured before syncing
   * const isTestOrderConfigured = await instance.isConfigured('test_order')
   * const isTestReportConfigured = await instance.isConfigured('test_report')
   *
   * if (isTestOrderConfigured) {
   *   await instance.create('test_order', orderData)
   * }
   * ```
   */
  async isConfigured(modelHandle: string): Promise<boolean> {
    const { data } = await callCore<{ configured: boolean }>('instance.isConfigured', {
      modelHandle,
    })
    return data.configured
  },

  /**
   * Check which models from a list are configured for the current app installation.
   *
   * This is more efficient than calling isConfigured() multiple times as it
   * makes a single API call to check all models at once.
   *
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @param modelHandles - Array of model handles from provision config
   * @returns Map of model handle to configuration status
   *
   * @example
   * ```ts
   * // Check multiple models at once
   * const configStatus = await instance.getConfiguredModels([
   *   'test_order',
   *   'test_report',
   *   'panel_result',
   *   'culture_result',
   * ])
   *
   * if (configStatus.get('test_order')) {
   *   // test_order is configured
   * }
   * ```
   */
  async getConfiguredModels(modelHandles: string[]): Promise<Map<string, boolean>> {
    const { data } = await callCore<Record<string, boolean>>('instance.getConfiguredModels', {
      modelHandles,
    })
    return new Map(Object.entries(data))
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Client
// ─────────────────────────────────────────────────────────────────────────────

export const token = {
  /**
   * Exchange an sk_app_ or sk_prv_ token for an installation-scoped InstanceClient.
   *
   * **Requires sk_app_ or sk_prv_ token** - works with app-level or provision tokens.
   * Used by developer tools after discovering `appInstallationId` from a record.
   *
   * Returns an InstanceClient bound to the installation's sk_wkp_ token.
   * All CRM writes should use this scoped client.
   *
   * The underlying JWT is short-lived (1 hour) and scoped to the specific installation.
   *
   * @example
   * ```ts
   * // Developer tool: discover → exchange → write
   * const accessRequest = await instance.get('access_request', id) // uses sk_prv_
   * if (!accessRequest?.appInstallationId) {
   *   throw new Error('Access request missing appInstallationId')
   * }
   *
   * // Exchange for a scoped instance client
   * const scopedInstance = await token.exchange(accessRequest.appInstallationId)
   *
   * // All writes use the scoped client (sk_wkp_ internally)
   * await scopedInstance.create('studio', { ... })
   * await scopedInstance.update('access_request', id, { status: 'APPROVED' })
   * ```
   */
  async exchange(appInstallationId: string): Promise<InstanceClient> {
    const { data } = await callCore<{ token: string }>('token.exchange', {
      appInstallationId,
    })
    const { baseUrl } = getEffectiveConfig()
    return createInstanceClient({ apiToken: data.token, baseUrl })
  },

  /**
   * Exchange an sk_app_ or sk_prv_ token for a raw installation-scoped JWT.
   *
   * **Requires sk_app_ or sk_prv_ token** - works with app-level or provision tokens.
   * For most use cases, prefer `token.exchange()` which returns a ready-to-use InstanceClient.
   *
   * Use this when you need the raw token string (e.g., for passing to external services,
   * storing for later use, or advanced scenarios requiring manual config management).
   *
   * @example
   * ```ts
   * // Get raw token for advanced use cases
   * const { token: scopedToken, appInstallationId } = await token.exchangeRaw(installId)
   *
   * // Manual config management
   * runWithConfig({ apiToken: scopedToken, baseUrl: config.baseUrl }, async () => {
   *   await communicationChannel.list({ filter: { ... } })
   * })
   * ```
   */
  async exchangeRaw(appInstallationId: string): Promise<{ token: string; appInstallationId: string }> {
    const { data } = await callCore<{ token: string }>('token.exchange', {
      appInstallationId,
    })
    return { token: data.token, appInstallationId }
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

/**
 * Response from file.get
 */
export interface FileInfo {
  /** File ID (fl_xxx format) */
  id: string
  /** Original filename */
  name: string
  /** MIME type of the file */
  mimeType: string
  /** File size in bytes */
  size: number
  /** ISO timestamp when the file was created */
  createdAt: string
}

/**
 * Parameters for file.upload
 */
export interface FileUploadParams {
  /** File content - Buffer or base64-encoded string */
  content: Buffer | string
  /** Original filename */
  name: string
  /** MIME type of the file */
  mimeType: string
  /** Optional path prefix for organization (e.g., 'attachments', 'images') */
  path?: string
}

/**
 * Response from file.upload
 */
export interface FileUploadResult {
  /** File ID (fl_xxx format) */
  id: string
  /** Public URL (null for private files) */
  url: string | null
}

export const file = {
  /**
   * Get file metadata by ID.
   *
   * Returns file information including name, mimeType, and size.
   * Files are validated to ensure they belong to the requesting app installation.
   *
   * @example
   * ```ts
   * // Get file info
   * const fileInfo = await file.get('fl_abc123')
   * console.log(fileInfo.name) // 'document.pdf'
   * console.log(fileInfo.mimeType) // 'application/pdf'
   * console.log(fileInfo.size) // 12345
   * ```
   */
  async get(fileId: string): Promise<FileInfo> {
    const { data } = await callCore<FileInfo>('file.get', {
      fileId,
    })
    return data
  },

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

  /**
   * Upload file content and create a File record.
   *
   * Files are scoped to the app installation and stored privately.
   * Use file.getUrl() to generate a temporary download URL when needed.
   *
   * @example
   * ```ts
   * // Upload a file from a Buffer
   * const buffer = await downloadFromExternalUrl(url)
   * const { id } = await file.upload({
   *   content: buffer,
   *   name: 'document.pdf',
   *   mimeType: 'application/pdf',
   * })
   *
   * // Upload with a path prefix for organization
   * const { id } = await file.upload({
   *   content: imageBuffer,
   *   name: 'photo.jpg',
   *   mimeType: 'image/jpeg',
   *   path: 'attachments',
   * })
   * ```
   */
  async upload(params: FileUploadParams): Promise<FileUploadResult> {
    // Convert Buffer to base64 string for transport
    const content =
      typeof params.content === 'string'
        ? params.content
        : params.content.toString('base64')

    const { data } = await callCore<FileUploadResult>('file.upload', {
      content,
      name: params.name,
      mimeType: params.mimeType,
      ...(params.path ? { path: params.path } : {}),
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
// Cron Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for cron.subscribe
 */
export interface CronSubscribeParams {
  /** Name of the tool to invoke */
  toolName: string
  /** Cron schedule expression (e.g., "0/20 9-17 * * 1-5") */
  schedule: string
  /** Timezone for the schedule (e.g., "America/New_York"). Defaults to UTC. */
  timezone?: string
  /** Inputs to pass to the tool on each invocation */
  inputs?: Record<string, unknown>
  /** Key for cursor sharing (defaults to toolName if not specified) */
  cursorKey?: string
  /** Optional human-friendly label */
  label?: string
}

/**
 * Response from cron.subscribe
 */
export interface CronSubscribeResult {
  /** Subscription ID */
  id: string
  /** Name of the tool to invoke */
  toolName: string
  /** Schedule expression */
  schedule: string
  /** Timezone for the schedule */
  timezone: string
}

/**
 * Cron subscription info returned from cron.list
 */
export interface CronSubscriptionItem {
  /** Subscription ID */
  id: string
  /** Name of the tool to invoke */
  toolName: string
  /** Schedule expression */
  schedule: string
  /** Timezone for the schedule */
  timezone: string
  /** Whether this subscription is enabled */
  enabled: boolean
  /** Inputs passed to the tool */
  inputs: Record<string, unknown> | null
  /** Key for cursor sharing */
  cursorKey: string | null
  /** Human-friendly label */
  label: string | null
  /** ISO timestamp when created */
  createdAt: string
}

/**
 * Options for cron.list
 */
export interface CronListOptions {
  /** Filter by tool name */
  toolName?: string
}

export const cron = {
  /**
   * Subscribe to run a tool on a schedule.
   *
   * Creates a cron subscription that will invoke the specified tool
   * at the given schedule. Multiple subscriptions can share cursor
   * state via the cursorKey parameter.
   *
   * **Requires sk_wkp_ token** - subscriptions are scoped to the app installation.
   *
   * @example
   * ```ts
   * // Work hours: sync every 20 mins
   * await cron.subscribe({
   *   toolName: 'sync_lab_results',
   *   schedule: '0,20,40 9-17 * * 1-5',  // 9am-5pm Mon-Fri
   *   timezone: 'America/New_York',
   *   inputs: { source: 'vetnostics' },
   *   label: 'Work hours sync',
   * })
   *
   * // After hours: sync every 3 hours (shares cursor with work hours)
   * await cron.subscribe({
   *   toolName: 'sync_lab_results',
   *   schedule: '0 0,3,6,9,12,15,18,21 * * *',
   *   timezone: 'America/New_York',
   *   inputs: { source: 'vetnostics' },
   *   label: 'After hours sync',
   * })
   * ```
   */
  async subscribe(params: CronSubscribeParams): Promise<CronSubscribeResult> {
    const { data } = await callCore<CronSubscribeResult>('cron.subscribe', params as unknown as Record<string, unknown>)
    return data
  },

  /**
   * Unsubscribe from a cron subscription.
   *
   * Stops the scheduled tool invocation and deletes the subscription.
   *
   * @param subscriptionId - The subscription ID to delete
   * @returns Whether the subscription was deleted (false if not found)
   *
   * @example
   * ```ts
   * const { deleted } = await cron.unsubscribe('crsub_abc123')
   * ```
   */
  async unsubscribe(subscriptionId: string): Promise<{ deleted: boolean }> {
    const { data } = await callCore<{ deleted: boolean }>('cron.unsubscribe', {
      subscriptionId,
    })
    return data
  },

  /**
   * List cron subscriptions for this installation.
   *
   * @param options - Optional filter by tool name
   * @returns Array of cron subscriptions
   *
   * @example
   * ```ts
   * // List all subscriptions
   * const { subscriptions } = await cron.list()
   *
   * // List subscriptions for a specific tool
   * const { subscriptions } = await cron.list({ toolName: 'sync_lab_results' })
   * ```
   */
  async list(options?: CronListOptions): Promise<{ subscriptions: CronSubscriptionItem[] }> {
    const { data } = await callCore<CronSubscriptionItem[]>('cron.list', {
      ...(options?.toolName ? { toolName: options.toolName } : {}),
    })
    return { subscriptions: data }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Client
// ─────────────────────────────────────────────────────────────────────────────

export interface EventCreateResult {
  /** false when no EventSubscription matches (passthrough) */
  emitted: boolean
  eventId: string | null
  /** Present when server returns resolved event type */
  eventType?: string
}

export interface EventCreateOptions {
  /** Context trigger source, e.g. tool_call, webhook, cli */
  trigger?: string
  correlationId?: string
  /** App handle namespace for event type (CLI default: cli) */
  app?: string
  /** Additional context fields merged into event payload context */
  context?: Record<string, unknown>
}

/**
 * event.create - Emit an app event to the platform event bus.
 */
export const event = {
  async create(
    name: string,
    payload: Record<string, unknown>,
    options?: EventCreateOptions,
  ): Promise<EventCreateResult> {
    const { trigger, correlationId, app, context: extraContext } = options ?? {}
    const context: Record<string, unknown> = {
      ...(extraContext ?? {}),
      ...(trigger ? { trigger } : {}),
      ...(correlationId ? { correlationId } : {}),
    }

    const { data } = await callCore<EventCreateResult>('event.create', {
      name,
      payload,
      ...(Object.keys(context).length > 0 ? { context } : {}),
      ...(app ? { app } : {}),
    })
    return data
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
  /** Optional: field mappings (provision field handle -> workspace field ID) */
  fieldMappings?: Record<string, string>
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
   * The API token determines the context (app installation is embedded in sk_wkp_ tokens).
   *
   * @param params - Link parameters
   *
   * @example
   * ```ts
   * // Link the SHARED 'contact' model to user's 'Clients' model
   * const { instanceId } = await resource.link({
   *   handle: 'contact',           // SHARED model handle from provision config
   *   targetModelId: modelId,      // User's selected model ID
   *   channelId: channel.id,       // Optional: scope to communication channel
   * })
   * ```
   */
  async link(
    params: ResourceLinkParams,
  ): Promise<ResourceLinkResult> {
    const { data } = await callCore<ResourceLinkResult>('resource.link', {
      ...params,
    })
    return data
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Text content part for multimodal messages.
 */
export interface AITextContent {
  type: 'text'
  text: string
}

/**
 * File content part for multimodal messages.
 * References a file uploaded via file.upload().
 */
export interface AIFileContent {
  type: 'file'
  fileId: string
}

/**
 * Image content part for multimodal messages.
 * Accepts base64 data URI (e.g., "data:image/png;base64,...").
 */
export interface AIImageContent {
  type: 'image'
  image: string
}

/**
 * Content types for multimodal AI messages.
 */
export type AIMessageContent = AITextContent | AIFileContent | AIImageContent

/**
 * Message in a multi-turn AI conversation.
 */
export interface AIMessage {
  role: 'user' | 'assistant'
  content: string | AIMessageContent[]
}

/**
 * Options for ai.generateObject().
 */
export interface GenerateObjectOptions<S extends z.ZodTypeAny> {
  /**
   * Model ID in gateway format (e.g., "openai/gpt-4o-mini").
   * Defaults to system default model if not specified.
   */
  model?: string

  /**
   * System prompt that sets the context for the AI.
   */
  system: string

  /**
   * User prompt for simple text mode.
   * Use this for single-turn requests without files.
   */
  prompt?: string

  /**
   * Zod schema defining the expected output structure.
   * The AI will generate an object conforming to this schema.
   */
  schema: S

  /**
   * File IDs to include with the prompt.
   * A simpler alternative to using `messages` when you just need to attach files.
   * Files are resolved and sent as multimodal content alongside the prompt.
   */
  files?: string[]

  /**
   * Messages for multi-turn or multimodal conversations.
   * Use this instead of `prompt` when you need more control over the conversation.
   */
  messages?: AIMessage[]

  /**
   * Maximum number of tokens to generate.
   */
  maxTokens?: number

  /**
   * Temperature for response randomness (0-1).
   * Lower values are more deterministic.
   */
  temperature?: number
}

/**
 * Result from ai.generateObject().
 */
export interface GenerateObjectResult<T> {
  /** The generated object conforming to the schema */
  object: T
  /** Token usage information */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Convert a Zod schema to JSON Schema format for transport using Zod's built-in conversion.
 * Uses z.toJSONSchema() from Zod 4 for accurate schema conversion.
 */
function zodSchemaToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>
}

export const ai = {
  /**
   * Generate a structured object using AI.
   *
   * The AI will generate an object that conforms to the provided Zod schema.
   * Supports both simple text prompts and multimodal messages with files/images.
   *
   * @example
   * ```ts
   * // Simple text prompt
   * const result = await ai.generateObject({
   *   system: 'Extract patient information from the text.',
   *   prompt: 'Patient: Max, Species: Canine, DOB: 2020-01-15',
   *   schema: z.object({
   *     patientName: z.string(),
   *     species: z.string(),
   *     dateOfBirth: z.string().nullable(),
   *   }),
   * })
   *
   * // With files array (simple multimodal)
   * const result = await ai.generateObject({
   *   model: 'openai/gpt-4o',
   *   system: 'Parse the lab report and extract test results.',
   *   prompt: 'Extract all test results from this report.',
   *   files: ['fl_abc123'],
   *   schema: TestResultsSchema,
   * })
   *
   * // With messages (advanced multimodal)
   * const result = await ai.generateObject({
   *   model: 'openai/gpt-4o',
   *   system: 'Parse the lab report and extract test results.',
   *   schema: TestResultsSchema,
   *   messages: [
   *     {
   *       role: 'user',
   *       content: [
   *         { type: 'text', text: 'Extract all test results from this report.' },
   *         { type: 'file', fileId: 'fl_abc123' },
   *       ],
   *     },
   *   ],
   * })
   * ```
   */
  async generateObject<S extends z.ZodTypeAny>(
    options: GenerateObjectOptions<S>,
  ): Promise<z.infer<S>> {
    // Validate that either prompt or messages is provided
    if (!options.prompt && !options.messages) {
      throw new Error('Either prompt or messages must be provided')
    }

    // Convert Zod schema to JSON Schema for transport
    const jsonSchema = zodSchemaToJsonSchema(options.schema)

    const { data } = await callCore<z.infer<S>>('ai.generateObject', {
      ...(options.model ? { model: options.model } : {}),
      system: options.system,
      ...(options.prompt ? { prompt: options.prompt } : {}),
      schema: jsonSchema,
      ...(options.files && options.files.length > 0 ? { files: options.files } : {}),
      ...(options.messages ? { messages: options.messages } : {}),
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    })

    return data
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Client (voice + real-time transcription)
// ─────────────────────────────────────────────────────────────────────────────

export interface CallStartParams {
  /** Communication channel (the Twilio number) this call belongs to */
  communicationChannelId: string
  /** Caller number in E.164 */
  fromNumber: string
  /** The dialed number (our Twilio number) in E.164 */
  toNumber: string
  /** Number the call is forwarded/dialed to (the human agent leg) */
  forwardedToNumber?: string | null
  direction?: 'INBOUND' | 'OUTBOUND'
  /** Provider call id (Twilio CallSid) */
  externalId?: string | null
  /** Raw provider status string (e.g. Twilio "ringing") */
  externalStatus?: string | null
  /** Transcription provider/engine name (e.g. "deepgram", "google") */
  transcriptionEngine?: string | null
  callerName?: string | null
  callerContactId?: string | null
  agentName?: string | null
  agentMemberId?: string | null
}

export interface CallStartResult {
  callSessionId: string
  threadId: string
}

export interface CallAppendTranscriptParams {
  callSessionId: string
  /** Utterance text */
  content: string
  track?: 'inbound_track' | 'outbound_track'
  speakerLabel?: string
  confidence?: number
  stability?: number
  sequenceId?: number
  isFinal?: boolean
  externalId?: string | null
}

export interface CallEndParams {
  callSessionId: string
  status?:
    | 'SCHEDULED'
    | 'RINGING'
    | 'IN_PROGRESS'
    | 'ON_HOLD'
    | 'ENDED'
    | 'MISSED'
    | 'DECLINED'
    | 'FAILED'
  externalStatus?: string | null
  /** Call duration in seconds */
  duration?: number | null
  endedAt?: string | null
  recordingUrl?: string | null
  recordingSid?: string | null
}

export interface CallSummarizeResult {
  callSessionId: string
  summary: string | null
}

/**
 * Call client - manage a voice call session and its real-time transcript.
 *
 * Designed for the phone integration's Twilio Real-Time Transcription webhooks:
 * - `start` when the inbound call arrives (creates the CallSession + thread + CALL block)
 * - `appendTranscript` for each `transcription-content` event (stored as a tagged ThreadMessage)
 * - `end` on call completion / `transcription-stopped`
 * - `summarize` to generate and persist an end-of-call summary
 *
 * **Requires sk_wkp_ or sk_app_ token.**
 */
export const call = {
  async start(params: CallStartParams): Promise<CallStartResult> {
    const { data } = await callCore<CallStartResult>('call.start', {
      ...params,
    })
    return data
  },

  async appendTranscript(
    params: CallAppendTranscriptParams,
  ): Promise<{ messageId: string; threadId: string }> {
    const { data } = await callCore<{ messageId: string; threadId: string }>(
      'call.appendTranscript',
      { ...params },
    )
    return data
  },

  async end(
    params: CallEndParams,
  ): Promise<{ callSessionId: string; threadId: string }> {
    const { data } = await callCore<{ callSessionId: string; threadId: string }>(
      'call.end',
      { ...params },
    )
    return data
  },

  async summarize(params: {
    callSessionId: string
  }): Promise<CallSummarizeResult> {
    const { data } = await callCore<CallSummarizeResult>('call.summarize', {
      ...params,
    })
    return data
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for report.generate().
 */
export interface ReportGenerateParams {
  /** Report template handle (e.g., 'lab-results', 'patient-summary') */
  templateHandle: string
  /** Arguments to pass to the report template */
  arguments?: Record<string, unknown>
  /** Set to 'html' to return HTML content instead of URL */
  mode?: 'html'
}

/**
 * Result from report.generate().
 */
export interface ReportGenerateResult {
  /** Report URL (when mode is not specified) */
  url?: string
  /** Report HTML content (when mode is 'html') */
  html?: string
}

/**
 * Parameters for report.define().
 */
export interface ReportDefineParams {
  /** YAML template content */
  yaml: string
}

/**
 * Result from report.define().
 */
export interface ReportDefineResult {
  /** Created/updated definition ID */
  definitionId: string
  /** Report handle from template */
  handle: string
  /** Current version number */
  version: number
}

/**
 * Parameters for report.list().
 */
export interface ReportListParams {
  /** Page number (default: 1) */
  page?: number
  /** Items per page (default: 50) */
  limit?: number
}

/**
 * Report definition item in list results.
 */
export interface ReportListItem {
  /** Definition ID */
  id: string
  /** Report handle */
  handle: string
  /** Report name */
  name: string
  /** Report description */
  description: string | null
  /** Version number */
  version: number
  /** Status (active, archived) */
  status: string
  /** ISO timestamp when created */
  createdAt: string
  /** ISO timestamp when last updated */
  updatedAt: string
}

/**
 * Result from report.list().
 */
export interface ReportListResult {
  data: ReportListItem[]
  pagination: InstancePagination
}

/**
 * Full report definition details.
 */
export interface ReportDefinition {
  /** Definition ID */
  id: string
  /** Report handle */
  handle: string
  /** Report name */
  name: string
  /** Report description */
  description: string | null
  /** YAML template content */
  templateYaml: string
  /** Global arguments configuration */
  globalArguments: Record<string, unknown> | null
  /** Version number */
  version: number
  /** Status (active, archived) */
  status: string
  /** ISO timestamp when created */
  createdAt: string
  /** ISO timestamp when last updated */
  updatedAt: string
}

export const report = {
  /**
   * Generate a report from a template.
   *
   * By default, returns a URL to view the report. Set `mode: 'html'` to get
   * the rendered HTML content directly.
   *
   * **Requires sk_wkp_ token** - reports are scoped to workplaces.
   *
   * @example
   * ```ts
   * // Get report URL (default)
   * const { url } = await report.generate({
   *   templateHandle: 'lab-results',
   *   arguments: { patient_id: 'ins_abc123' },
   * })
   * console.log(url) // https://app.skedyul.com/crux/reports/lab-results/generate?patient_id=ins_abc123
   *
   * // Get HTML content
   * const { html } = await report.generate({
   *   templateHandle: 'lab-results',
   *   arguments: { patient_id: 'ins_abc123' },
   *   mode: 'html',
   * })
   * // Use html for email, PDF generation, etc.
   * ```
   */
  async generate(params: ReportGenerateParams): Promise<ReportGenerateResult> {
    const { data } = await callCore<ReportGenerateResult>('report.generate', {
      templateHandle: params.templateHandle,
      ...(params.arguments ? { arguments: params.arguments } : {}),
      ...(params.mode ? { mode: params.mode } : {}),
    })
    return data
  },

  /**
   * Define (create or update) a report from a YAML template.
   *
   * If a report with the same handle already exists, it will be updated
   * and the version number incremented.
   *
   * **Requires sk_wkp_ token** - reports are scoped to workplaces.
   *
   * @example
   * ```ts
   * const { definitionId, handle, version } = await report.define({
   *   yaml: `
   *     handle: patient-summary
   *     name: Patient Summary
   *     sections:
   *       - type: header
   *         title: "{{ patient.name }}"
   *   `,
   * })
   * console.log(`Created report ${handle} v${version}`)
   * ```
   */
  async define(params: ReportDefineParams): Promise<ReportDefineResult> {
    const { data } = await callCore<ReportDefineResult>('report.define', {
      yaml: params.yaml,
    })
    return data
  },

  /**
   * List report definitions in the workplace.
   *
   * **Requires sk_wkp_ token** - reports are scoped to workplaces.
   *
   * @example
   * ```ts
   * const { data, pagination } = await report.list({ page: 1, limit: 10 })
   * for (const def of data) {
   *   console.log(`${def.handle}: ${def.name} (v${def.version})`)
   * }
   * ```
   */
  async list(params?: ReportListParams): Promise<ReportListResult> {
    const { data, pagination } = await callCore<ReportListItem[]>('report.list', {
      ...(params?.page !== undefined ? { page: params.page } : {}),
      ...(params?.limit !== undefined ? { limit: params.limit } : {}),
    })
    return {
      data,
      pagination: pagination ?? { page: 1, total: 0, hasMore: false, limit: params?.limit ?? 50 },
    }
  },

  /**
   * Get a report definition by handle.
   *
   * **Requires sk_wkp_ token** - reports are scoped to workplaces.
   *
   * @example
   * ```ts
   * const definition = await report.get('lab-results')
   * if (definition) {
   *   console.log(definition.templateYaml)
   * }
   * ```
   */
  async get(handle: string): Promise<ReportDefinition | null> {
    const { data } = await callCore<ReportDefinition | null>('report.get', {
      handle,
    })
    return data
  },
}
