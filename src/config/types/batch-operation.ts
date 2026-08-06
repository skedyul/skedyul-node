/**
 * Batch operation definition types.
 *
 * Batch operations allow apps to define long-running, paginated operations
 * like member imports, data syncs, and batch API calls. The platform handles
 * orchestration, progress tracking, CRM mapping, and upsert.
 */

import type { InvocationContext } from '../../types/invocation'
import type { ToolBilling, ToolError, ToolRetry } from '../../types/tool'
import type { AppInfo, WorkplaceInfo } from '../../types/shared'

// Re-export tool types used on batch envelopes for convenience
export type { ToolBilling, ToolError, ToolRetry }

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
 * Soft-failure return from setup/iterate (tool-call shaped).
 */
export interface BatchOperationFailure {
  success: false
  error: ToolError
  retry?: ToolRetry
  billing?: ToolBilling
}

/**
 * Result from a batch operation setup function.
 */
export interface BatchOperationSetupResult {
  /** Optional state to persist across iterate calls */
  state?: Record<string, unknown>
  /** Optional total count for progress display */
  total?: number
  /**
   * Cascade phases (usually injected from the operation definition by the
   * route handler so the platform workflow can resolve map-gated targets).
   */
  cascade?: BatchCascadePhase[]
  /** Optional billing (normalized by the route if omitted) */
  billing?: ToolBilling
  /** Optional success discriminator (default true when domain fields present) */
  success?: true
}

/**
 * Cascade phase for multi-entity batch imports.
 * Platform upserts configured entities in `order` within each wave.
 */
export interface BatchCascadePhase {
  /** App entity handle to upsert */
  entity: string
  /** Lower runs first within the same wave */
  order: number
  /** setup = once (typically first iterate); page = every iterate page */
  wave: 'setup' | 'page'
  /**
   * Other cascade entities that must also be CRM-configured for this phase
   * to run (e.g. plan requires package).
   */
  requires?: string[]
}

/**
 * Result from a batch operation iterate function.
 */
export interface BatchOperationIterateResult {
  /**
   * Array of raw items for the primary `entity`.
   * Prefer `itemsByEntity` for cascade imports; when both are set, platform
   * uses `itemsByEntity` and falls back to `items` for the primary entity.
   */
  items: Record<string, unknown>[]
  /**
   * Multi-entity items keyed by entity handle (cascade imports).
   * Platform upserts each configured entity in cascade order.
   */
  itemsByEntity?: Record<string, Record<string, unknown>[]>
  /** Pagination info for fetching more pages */
  pagination: BatchPagination
  /** Optional state to persist for the next iterate call */
  state?: Record<string, unknown>
  /** Optional billing (normalized by the route if omitted) */
  billing?: ToolBilling
  /** Optional success discriminator (default true when domain fields present) */
  success?: true
}

export type BatchOperationSetupReturn =
  | BatchOperationSetupResult
  | BatchOperationFailure

export type BatchOperationIterateReturn =
  | BatchOperationIterateResult
  | BatchOperationFailure

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
  /** App info with version (for rate-limit / SDK context) */
  app?: AppInfo
  /** Workplace info when available */
  workplace?: WorkplaceInfo
  /** User-provided input (if any) */
  input?: Record<string, unknown>
  /** State from previous setup or iterate call */
  state?: Record<string, unknown>
  /**
   * Merged environment (process.env + baked MCP_ENV + request env),
   * same layering as tool handlers via buildToolExecutionEnv.
   */
  env: Record<string, string>
  /** Invocation context for log traceability */
  invocation?: InvocationContext
  /**
   * Entity handles whose CRM maps are configured for this job's cascade.
   * Platform injects this on iterate so apps can skip expensive fetches
   * (e.g. per-member credits) when that entity is not mapped.
   */
  cascadeEntities?: string[]
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
) => Promise<BatchOperationSetupReturn>

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
) => Promise<BatchOperationIterateReturn>

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
   * Primary entity handle (progress + start gate).
   * The platform applies CRM mappings and calls upsertMany.
   */
  entity: string
  /**
   * Optional multi-entity cascade. When set, iterate may return
   * `itemsByEntity` and the platform upserts map-configured phases in order.
   */
  cascade?: BatchCascadePhase[]
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
