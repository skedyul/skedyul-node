/**
 * Page definition types.
 *
 * Pages define the UI screens for an app, including their
 * layout, data context, and navigation.
 */

import type { BaseDefinition } from './base'
import type { ContextDefinition } from './context'
import type { ActionDefinition, BlockDefinition } from './form'
import type { NavigationConfig } from './navigation'

/**
 * Page type.
 * - 'instance': Shows a single record (e.g., /phone-numbers/:id)
 * - 'list': Shows multiple records (e.g., /phone-numbers)
 */
export type PageType = 'instance' | 'list'

/**
 * Page definition.
 */
export interface PageDefinition extends BaseDefinition {
  /** Page type */
  type: PageType
  /** URL path (e.g., '/phone-numbers' or '/phone-numbers/[id]' for dynamic segments) */
  path: string
  /** When true, this page is the default landing page for the app */
  default?: boolean
  /**
   * Navigation configuration:
   * - true/false: show/hide in auto-generated navigation
   * - string: Liquid template that evaluates to true/false
   * - NavigationConfig: full navigation override for this page
   */
  navigation?: boolean | string | NavigationConfig
  /** Page blocks (cards, lists, etc.) */
  blocks: BlockDefinition[]
  /** Page-level actions */
  actions?: ActionDefinition[]
  /** Context data to load for Liquid templates */
  context?: ContextDefinition
}
