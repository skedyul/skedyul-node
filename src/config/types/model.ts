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
 * - 'long_string': Long text (multi-line, stored as text in DB)
 * - 'text': Alias for long_string
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
  | 'long_string'
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
 * Behavior when a related record is deleted.
 * - 'none': No action (orphan the reference)
 * - 'cascade': Delete related records
 * - 'restrict': Prevent deletion if references exist
 */
export type OnDelete = 'none' | 'cascade' | 'restrict'

/**
 * Inline field definition for options and validation constraints.
 */
export interface InlineFieldDefinition {
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
  /** Inline definition with options and constraints */
  definition?: InlineFieldDefinition
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
  /** Whether to create default LIST and INSTANCE pages for this model (default: false for provisioning) */
  addDefaultPages?: boolean
  /** Whether to create a navigation item for this model (default: false for provisioning) */
  addNavigation?: boolean
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
}

/**
 * Relationship cardinality from source (one) to target (many or one).
 * - 'one_to_one': One source record relates to one target record
 * - 'one_to_many': One source record relates to many target records
 * 
 * Note: For many-to-one relationships, swap source and target and use 'one_to_many'.
 */
export type Cardinality = 'one_to_one' | 'one_to_many'

/**
 * Relationship definition between two models.
 * Source is always the "one" side, target is the "many" side (for one_to_many).
 */
export interface RelationshipDefinition {
  /** Source side of the relationship (the "one" side) */
  source: RelationshipLink
  /** Target side of the relationship (the "many" side for one_to_many) */
  target: RelationshipLink
  /** Cardinality: 'one_to_one' or 'one_to_many' */
  cardinality: Cardinality
  /** Behavior when a related record is deleted */
  onDelete?: OnDelete
}
