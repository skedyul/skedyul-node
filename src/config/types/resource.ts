// ─────────────────────────────────────────────────────────────────────────────
// Resource Dependencies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Field-level data ownership.
 * APP: App exclusively controls this data (e.g., status field set by webhook)
 * WORKPLACE: User/organization provides this data (e.g., file upload)
 * BOTH: Collaborative - either can update
 */
export type FieldOwner = 'APP' | 'WORKPLACE' | 'BOTH'

/**
 * StructuredFilter for conditional dependencies.
 * Format: { fieldHandle: { operator: value | value[] } }
 */
export type StructuredFilter = Record<string, Record<string, string | number | boolean | (string | number | boolean)[]>>

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
