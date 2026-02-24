/**
 * Resource dependency types for declaring relationships between resources.
 */

import type { FieldOwner, StructuredFilter } from './base'

// Re-export from base for backwards compatibility during migration
export type { FieldOwner, StructuredFilter }

/** Model dependency reference */
export interface ModelDependency {
  model: string
  fields?: string[]
  where?: StructuredFilter
}

/** Channel dependency reference */
export interface ChannelDependency {
  channel: string
}

/** Workflow dependency reference */
export interface WorkflowDependency {
  workflow: string
}

/** Union of all resource dependency types */
export type ResourceDependency = ModelDependency | ChannelDependency | WorkflowDependency
