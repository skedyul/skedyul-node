/**
 * Model and field definition types.
 *
 * Models define the data schema for an app. They can be:
 * - 'internal': App-owned, created during provisioning
 * - 'shared': User-mapped, configured during installation
 */

import type { BaseDefinition, FieldOwner, FieldOption, Scope } from './base'
import type { ResourceDependency } from './resource'

/**
 * Field data types (lowercase).
 * - 'string': Short text (single line)
 * - 'text': Long text (multi-line)
 * - 'number': Numeric value
 * - 'boolean': True/false
 * - 'date': Date only (no time)
 * - 'datetime': Date and time
 * - 'time': Time only (no date)
 * - 'file': File attachment
 * - 'image': Image file
 * - 'relation': Reference to another model
 * - 'object': JSON object
 */
export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'file'
  | 'image'
  | 'relation'
  | 'object'

/**
 * Relationship cardinality between models.
 */
export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many'

/**
 * Behavior when a related record is deleted.
 * - 'none': No action (orphan the reference)
 * - 'cascade': Delete related records
 * - 'restrict': Prevent deletion if references exist
 */
export type OnDelete = 'none' | 'cascade' | 'restrict'

/**
 * Inline field definition for constraints and options.
 */
export interface FieldConstraints {
  /** Limit number of selections for select fields */
  limitChoices?: number
  /** Options for select/dropdown fields */
  options?: FieldOption[]
  /** Minimum string length */
  minLength?: number
  /** Maximum string length */
  maxLength?: number
  /** Minimum numeric value */
  min?: number
  /** Maximum numeric value */
  max?: number
  /** Related model handle for relation fields */
  relatedModel?: string
  /** Regex pattern for validation */
  pattern?: string
}

/**
 * Field visibility settings in the UI.
 */
export interface FieldVisibility {
  /** Show in data views */
  data?: boolean
  /** Show in list/table views */
  list?: boolean
  /** Show in filter panels */
  filters?: boolean
}

/**
 * Field definition within a model.
 */
export interface FieldDefinition {
  /** Unique identifier within the model (snake_case) */
  handle: string
  /** Human-readable display name */
  label: string
  /** Field data type */
  type?: FieldType
  /** Reference to a shared field definition by handle */
  definitionHandle?: string
  /** Inline constraints and options */
  constraints?: FieldConstraints
  /** Whether this field is required */
  required?: boolean
  /** Whether this field must be unique across all records */
  unique?: boolean
  /** Whether this field is system-managed (hidden from user editing) */
  system?: boolean
  /** Whether this field holds an array of values */
  list?: boolean
  /** Default value for new records */
  default?: unknown
  /** Description for documentation/UI */
  description?: string
  /** Visibility settings */
  visibility?: FieldVisibility
  /** Who can modify this field */
  owner?: FieldOwner
}

/**
 * Model definition.
 */
export interface ModelDefinition extends BaseDefinition {
  /** Plural form of the label (e.g., 'Compliance Records') */
  labelPlural?: string
  /** Liquid template for generating record labels (e.g., '{{ business_name }}') */
  labelTemplate?: string
  /** Model scope: 'internal' (app-owned) or 'shared' (user-mapped) */
  scope?: Scope
  /** Field definitions */
  fields: FieldDefinition[]
  /** Resource dependencies that must exist before this model can be used */
  requires?: ResourceDependency[]
}

/**
 * One side of a relationship link.
 */
export interface RelationshipLink {
  /** Model handle */
  model: string
  /** Field handle on the model */
  field: string
  /** Display label for this side of the relationship */
  label: string
  /** Cardinality from this side's perspective */
  cardinality: Cardinality
  /** Behavior when this record is deleted */
  onDelete?: OnDelete
}

/**
 * Relationship definition between two models.
 */
export interface RelationshipDefinition {
  /** Source side of the relationship */
  source: RelationshipLink
  /** Target side of the relationship */
  target: RelationshipLink
}
