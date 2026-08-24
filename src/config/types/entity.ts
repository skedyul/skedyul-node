/**
 * App entity definition types.
 *
 * Entities describe external/logical payload shapes that workplaces map to CRM
 * via install-time CRM maps. They are NOT shared models and they are NOT
 * internal models (internal models are for data shared across installs).
 * Workflows apply maps with an app-handle Liquid filter. Runtime
 * `instance.list/create/update('<entity>')` also resolves the mapped workplace model.
 */

import type { BaseDefinition, FieldOption } from './base'

/**
 * Suggested CRM map defaults for an entity when a workplace has matching models.
 * Declared by the app (industry-specific); consumed generically by core install UI.
 */
export interface EntityCrmMapDefaults {
  /** Workplace model handle to prefer */
  modelHandle: string
  /** Prefer this field as match when present on the model */
  matchFieldHandle?: string
  /** Ordered entity paths for match fallbacks (maps to same-named CRM fields) */
  matchRuleEntityPaths?: string[]
  /** entityPath → workplace field handle */
  fieldHandles: Record<string, string>
  /** entity relationship handle → workplace field handle */
  relationshipHandles?: Record<string, string>
  /**
   * Optional enum remaps per entity path when suggesting valueMaps
   * (e.g. membership_status: { trial_member: 'visiting_member' }).
   */
  valueAliases?: Record<string, Record<string, string>>
}

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
  /**
   * Whether this field uniquely identifies a record and can be used as an
   * upsert match key (e.g. external id, email, phone).
   */
  isUnique?: boolean
  /**
   * @deprecated Prefer `isUnique`. Kept for backward compatibility —
   * treated the same as `isUnique` by the CRM map editor.
   */
  matchCandidate?: boolean
  /** Whether this field should be mapped for a complete configuration */
  required?: boolean
  /**
   * Global FieldDefinition handle to attach when CRM apply creates or
   * retargets the mapped workplace field (e.g. `calendar/recurrence`).
   */
  definition?: string
  /** Enum options when the source value is constrained */
  options?: FieldOption[] | string[]
  /**
   * Optional CRM FieldDefinition handle to attach when Create fields
   * mints the workplace field (e.g. `calendar/series_id`, `phone`).
   * Core looks this up by handle; do not mint a private definition.
   */
  definition?: string
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
  /**
   * Optional suggested CRM map when the workplace has a matching model schema.
   * Used by install suggest/analyze — not applied automatically.
   */
  crmMapDefaults?: EntityCrmMapDefaults
}
