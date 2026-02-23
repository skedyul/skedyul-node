import type { FieldOwner, ResourceDependency } from './resource'

// ─────────────────────────────────────────────────────────────────────────────
// Model Definition
// ─────────────────────────────────────────────────────────────────────────────

export type InternalFieldDataType =
  | 'LONG_STRING'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATE_TIME'
  | 'TIME'
  | 'FILE'
  | 'IMAGE'
  | 'RELATION'
  | 'OBJECT'

export interface FieldOption {
  label: string
  value: string
  color?: string
}

export interface InlineFieldDefinition {
  limitChoices?: number
  options?: FieldOption[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  relatedModel?: string
  pattern?: string
}

export interface AppFieldVisibility {
  data?: boolean
  list?: boolean
  filters?: boolean
}

export interface ModelFieldDefinition {
  handle: string
  label: string
  type?: InternalFieldDataType
  definitionHandle?: string
  definition?: InlineFieldDefinition
  required?: boolean
  unique?: boolean
  system?: boolean
  isList?: boolean
  defaultValue?: { value: unknown }
  description?: string
  visibility?: AppFieldVisibility
  owner?: FieldOwner
}

export interface ModelDefinition {
  handle: string
  name: string
  namePlural?: string
  labelTemplate?: string
  description?: string
  fields: ModelFieldDefinition[]
  requires?: ResourceDependency[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Definition
// ─────────────────────────────────────────────────────────────────────────────

export type RelationshipCardinality = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY'
export type OnDeleteBehavior = 'NONE' | 'CASCADE' | 'RESTRICT'

export interface RelationshipLink {
  model: string
  field: string
  label: string
  cardinality: RelationshipCardinality
  onDelete?: OnDeleteBehavior
}

export interface RelationshipDefinition {
  source: RelationshipLink
  target: RelationshipLink
}
