/**
 * Batch operation runtime types.
 *
 * These types define the registry and context for batch operations at runtime.
 */

import type {
  BatchCascadePhase,
  BatchOperationContext,
  BatchOperationSetupFn,
  BatchOperationIterateFn,
} from '../config/types/batch-operation'

export type {
  BatchCascadePhase,
  BatchOperationContext,
} from '../config/types/batch-operation'

/**
 * Entry in the batch operation registry.
 * Contains both metadata and function implementations.
 */
export interface BatchOperationRegistryEntry {
  /** Unique handle for this operation */
  handle: string
  /** Human-readable label */
  label: string
  /** Description of what this operation does */
  description?: string
  /** Primary entity handle that items will be upserted to */
  entity: string
  /** Optional multi-entity cascade phases */
  cascade?: BatchCascadePhase[]
  /** Setup function called once at the start */
  setup?: BatchOperationSetupFn
  /** Iterate function called for each page */
  iterate: BatchOperationIterateFn
  /** Maximum concurrent operations per app installation */
  maxConcurrent?: number
  /** Default page size */
  pageSize?: number
  /** Optional icon */
  icon?: string
}

/**
 * Registry mapping batch operation handles to their implementations.
 */
export type BatchOperationRegistry = Record<string, BatchOperationRegistryEntry>

/**
 * Metadata for a batch operation (serializable, no functions).
 */
export interface BatchOperationMetadata {
  handle: string
  label: string
  description?: string
  entity: string
  cascade?: BatchCascadePhase[]
  maxConcurrent?: number
  pageSize?: number
  icon?: string
}
