/**
 * Page context definition types.
 *
 * Context defines data that is loaded and made available
 * to Liquid templates on a page.
 */

import type { StructuredFilter } from './base'

/**
 * Mode for context data fetching.
 * - 'first': Returns single object (or null)
 * - 'many': Returns array of objects
 * - 'count': Returns number
 */
export type ContextMode = 'first' | 'many' | 'count'

/**
 * Model-based context item definition.
 */
export interface ContextItemModel {
  /** Model handle to fetch data from */
  model: string
  /** Fetch mode */
  mode: ContextMode
  /**
   * Filters for the query.
   * Supports Liquid templates: { id: { eq: '{{ params.id }}' } }
   */
  filters?: StructuredFilter
  /** Optional limit for 'many' mode */
  limit?: number
}

/**
 * Tool-based context item definition.
 */
export interface ContextItemTool {
  /** Tool name to invoke for fetching context data */
  tool: string
}

/**
 * Context item definition (model or tool-based).
 */
export type ContextItem = ContextItemModel | ContextItemTool

/**
 * Context definition: variable name -> context item.
 * Variables are available in Liquid templates as {{ variable_name }}.
 */
export type ContextDefinition = Record<string, ContextItem>
