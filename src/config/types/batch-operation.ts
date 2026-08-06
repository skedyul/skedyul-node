/**
 * Batch operation definition types.
 *
 * Batch operations allow apps to define long-running, paginated operations
 * like member imports, data syncs, and batch API calls. The platform handles
 * orchestration, progress tracking, CRM mapping, and upsert.
 */

/**
 * Pagination response from an iterate function.
 * Supports both cursor-based and page-based pagination.
 */
export interface BatchPagination {
  /** Whether there are more items to fetch */
  hasMore: boolean
  /** Current page number (1-indexed, for page-based pagination) */
  page?: number
  /** Total number of pages (for page-based pagination) */
  total?: number
  /** Cursor for next page (for cursor-based pagination) */
  nextCursor?: string | number
  /** Items per page */
  limit?: number
}

/**
 * Result from a batch operation setup function.
 */
export interface BatchOperationSetupResult {
  /** Optional state to persist across iterate calls */
  state?: Record<string, unknown>
  /** Optional total count for progress display */
  total?: number
}

/**
 * Result from a batch operation iterate function.
 */
export interface BatchOperationIterateResult {
  /** Array of raw items from the external source */
  items: Record<string, unknown>[]
  /** Pagination info for fetching more pages */
  pagination: BatchPagination
  /** Optional state to persist for the next iterate call */
  state?: Record<string, unknown>
}

/**
 * Context passed to batch operation setup and iterate functions.
 */
export interface BatchOperationContext {
  /** Workplace ID */
  workplaceId: string
  /** App installation ID */
  appInstallationId: string
  /** App ID */
  appId: string
  /** User-provided input (if any) */
  input?: Record<string, unknown>
  /** State from previous setup or iterate call */
  state?: Record<string, unknown>
  /**
   * Runtime environment variables from the platform invoke
   * (APP_INSTALL overrides + SKEDYUL_API_TOKEN / SKEDYUL_API_URL).
   */
  env: Record<string, string>
  /** Logger instance */
  log: {
    info: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
    error: (message: string, meta?: Record<string, unknown>) => void
  }
}

/**
 * Type for batch operation setup function.
 */
export type BatchOperationSetupFn = (
  ctx: BatchOperationContext,
) => Promise<BatchOperationSetupResult>

/**
 * Type for batch operation iterate function.
 */
export type BatchOperationIterateFn = (
  ctx: BatchOperationContext & {
    /** Page to fetch (1-indexed, for page-based pagination) */
    page?: number
    /** Cursor from previous iterate (for cursor-based pagination) */
    cursor?: string | number
    /** Items per page */
    limit: number
  },
) => Promise<BatchOperationIterateResult>

/**
 * Batch operation definition.
 *
 * @example
 * export default defineBatchOperation({
 *   handle: 'import_members',
 *   label: 'Import Members',
 *   entity: 'member',
 *   setup: async (ctx) => {
 *     const count = await glofox.getMemberCount()
 *     return { total: count }
 *   },
 *   iterate: async (ctx) => {
 *     const apiKey = ctx.env.GLOFOX_API_KEY
 *     const { data, pagination } = await glofox.getMembers({
 *       apiKey,
 *       limit: ctx.limit,
 *       offset: ctx.cursor ?? 0,
 *     })
 *     return {
 *       items: data,
 *       pagination: {
 *         hasMore: pagination.hasMore,
 *         nextCursor: pagination.offset + pagination.limit,
 *       }
 *     }
 *   },
 *   maxConcurrent: 1,
 *   pageSize: 50,
 * })
 */
export interface BatchOperationDefinition {
  /** Unique handle for this operation */
  handle: string
  /** Human-readable label */
  label: string
  /** Description of what this operation does */
  description?: string
  /**
   * Entity handle that items will be upserted to.
   * The platform applies CRM mappings and calls upsertMany.
   */
  entity: string
  /**
   * Setup function called once at the start of the operation.
   * Use to initialize state, fetch total count, etc.
   */
  setup?: BatchOperationSetupFn
  /**
   * Iterate function called for each page of data.
   * Must return items and pagination info.
   */
  iterate: BatchOperationIterateFn
  /**
   * Maximum concurrent operations per app installation.
   * @default 1
   */
  maxConcurrent?: number
  /**
   * Default page size (items per iterate call).
   * @default 50
   */
  pageSize?: number
  /**
   * Optional icon for the operation (Lucide icon name)
   */
  icon?: string
}
