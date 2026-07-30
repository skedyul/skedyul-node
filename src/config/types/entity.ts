/**
 * App entity definition types.
 *
 * Entities describe external/logical payload shapes (e.g. Glofox member) that
 * workplaces map to CRM via install-time CRM maps. They are NOT shared models —
 * the app does not own CRM writes; workflows/agents apply maps.
 */

import type { BaseDefinition, FieldOption } from './base'

/**
 * Field on an app entity contract (maps to a path on tool/event payloads).
 */
export interface EntityFieldDefinition {
  /** Unique field handle (snake_case), used as source path by default */
  handle: string
  /** Human-readable label */
  label: string
  /** Optional description */
  description?: string
  /** Data type hint for the install mapper UI */
  type?:
    | 'string'
    | 'long_string'
    | 'number'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'object'
  /** Whether this field is a candidate for upsert match */
  matchCandidate?: boolean
  /** Whether this field should be mapped for a complete configuration */
  required?: boolean
  /** Enum options when the source value is constrained */
  options?: FieldOption[] | string[]
}

/**
 * Relationship declared on an entity (for install relationship mapping UI).
 */
export interface EntityRelationshipDefinition {
  /** Handle used when writing relationship ids (e.g. "customer", "plan") */
  handle: string
  /** Human-readable label */
  label: string
  /** Target entity handle this relates to (optional documentation) */
  targetEntity?: string
  description?: string
}

/**
 * App entity — mapping contract for install CRM maps + Liquid filters.
 */
export interface EntityDefinition extends BaseDefinition {
  /** Unique entity handle (e.g. "member", "booking") */
  handle: string
  /** Display label */
  label: string
  labelPlural?: string
  description?: string
  /** Fields on the primary entity object */
  fields: EntityFieldDefinition[]
  /**
   * Fields that live on the event/tool envelope alongside the entity
   * (e.g. membership_status on member events).
   */
  contextFields?: EntityFieldDefinition[]
  /** Relationship handles that can be mapped to CRM relationship fields */
  relationships?: EntityRelationshipDefinition[]
}
