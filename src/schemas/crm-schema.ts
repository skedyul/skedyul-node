import { z } from 'zod/v4'

// ─────────────────────────────────────────────────────────────────────────────
// CRM Schema - Serializable format for workplace-level migrations
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the canonical format used across CLI, MCP, and admin console.
// It is JSON-serializable and can be:
// - Stored in database
// - Uploaded via admin console
// - Passed via API/MCP
// - Version controlled as .schema.json
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Field data types for CRM schema (lowercase for JSON serialization).
 */
export const CRMFieldTypeSchema = z.enum([
  'string',
  'long_string',
  'number',
  'boolean',
  'date',
  'datetime',
  'time',
  'file',
  'image',
  'object',
])

export type CRMFieldType = z.infer<typeof CRMFieldTypeSchema>

/**
 * Field requirement types for CRM schema.
 */
export const CRMFieldRequirementSchema = z.enum([
  'optional',
  'on_create',
  'required',
])

export type CRMFieldRequirement = z.infer<typeof CRMFieldRequirementSchema>

/**
 * Field option for select/dropdown fields.
 */
export const CRMFieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  color: z.string().optional(),
})

export type CRMFieldOption = z.infer<typeof CRMFieldOptionSchema>

/**
 * Field definition constraints and options (object form).
 */
export const CRMFieldDefinitionObjectSchema = z.object({
  options: z.array(CRMFieldOptionSchema).optional(),
  limitChoices: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
})

/**
 * Field definition - can be a string (built-in like "email", "phone") or an object with constraints.
 */
export const CRMFieldDefinitionSchema = z.union([
  z.string(),
  CRMFieldDefinitionObjectSchema,
])

export type CRMFieldDefinition = z.infer<typeof CRMFieldDefinitionSchema>

/**
 * Field schema for CRM models.
 */
export const CRMFieldSchemaZ = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Handle must be lowercase alphanumeric with underscores, starting with a letter'),
  label: z.string().min(1, 'Label is required'),
  type: CRMFieldTypeSchema,
  description: z.string().optional(),
  requirement: CRMFieldRequirementSchema.optional(),
  unique: z.boolean().optional(),
  list: z.boolean().optional(),
  default: z.unknown().optional(),
  definition: CRMFieldDefinitionSchema.optional(),
})

export type CRMFieldSchema = z.infer<typeof CRMFieldSchemaZ>

/**
 * Model schema for CRM.
 */
export const CRMModelSchemaZ = z.object({
  handle: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Handle must be lowercase alphanumeric with underscores, starting with a letter'),
  name: z.string().min(1, 'Name is required'),
  namePlural: z.string().optional(),
  labelTemplate: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  fields: z.array(CRMFieldSchemaZ),
})

export type CRMModelSchema = z.infer<typeof CRMModelSchemaZ>

/**
 * Relationship cardinality.
 */
export const CRMCardinalitySchema = z.enum(['one_to_one', 'one_to_many'])

export type CRMCardinality = z.infer<typeof CRMCardinalitySchema>

/**
 * On delete behavior for relationships.
 */
export const CRMOnDeleteSchema = z.enum(['none', 'cascade', 'restrict'])

export type CRMOnDelete = z.infer<typeof CRMOnDeleteSchema>

/**
 * Relationship link (one side of a relationship).
 */
export const CRMRelationshipLinkSchema = z.object({
  model: z.string(),
  field: z.string(),
  label: z.string(),
})

export type CRMRelationshipLink = z.infer<typeof CRMRelationshipLinkSchema>

/**
 * Relationship schema between two models.
 */
export const CRMRelationshipSchemaZ = z.object({
  source: CRMRelationshipLinkSchema,
  target: CRMRelationshipLinkSchema,
  cardinality: CRMCardinalitySchema,
  onDelete: CRMOnDeleteSchema.optional(),
})

export type CRMRelationshipSchema = z.infer<typeof CRMRelationshipSchemaZ>

/**
 * Block type for pages.
 */
export const CRMBlockTypeSchema = z.enum([
  'spreadsheet',
  'form',
  'card',
  'metric',
  'kanban',
])

export type CRMBlockType = z.infer<typeof CRMBlockTypeSchema>

/**
 * Block schema for pages.
 */
export const CRMBlockSchemaZ = z.object({
  type: CRMBlockTypeSchema,
  title: z.string().optional(),
  config: z.unknown().optional(),
  default: z.boolean().optional(),
})

export type CRMBlockSchema = z.infer<typeof CRMBlockSchemaZ>

/**
 * Page type.
 */
export const CRMPageTypeSchema = z.enum(['list', 'instance'])

export type CRMPageType = z.infer<typeof CRMPageTypeSchema>

/**
 * Page schema for CRM.
 */
export const CRMPageSchemaZ = z.object({
  path: z.string(),
  type: CRMPageTypeSchema,
  title: z.string(),
  icon: z.string().optional(),
  modelHandle: z.string(),
  parentPath: z.string().optional(),
  baseQuery: z.unknown().optional(),
  blocks: z.array(CRMBlockSchemaZ).optional(),
})

export type CRMPageSchema = z.infer<typeof CRMPageSchemaZ>

/**
 * Navigation item schema.
 */
export const CRMNavigationItemSchemaZ = z.object({
  label: z.string(),
  icon: z.string().optional(),
  path: z.string(),
  sortIndex: z.number().optional(),
})

export type CRMNavigationItemSchema = z.infer<typeof CRMNavigationItemSchemaZ>

/**
 * Navigation schema.
 */
export const CRMNavigationSchemaZ = z.object({
  sidebar: z.array(CRMNavigationItemSchemaZ).optional(),
})

export type CRMNavigationSchema = z.infer<typeof CRMNavigationSchemaZ>

/**
 * Main CRM Schema - the serializable format for workplace-level migrations.
 */
export const CRMSchemaZ = z.object({
  /** Schema format version for future compatibility */
  $schema: z.literal('https://skedyul.com/schemas/crm/v1').optional(),
  /** Schema name for identification */
  name: z.string().min(1, 'Name is required'),
  /** Optional description */
  description: z.string().optional(),
  /** Schema version (semver) */
  version: z.string().optional(),
  /** Model definitions */
  models: z.array(CRMModelSchemaZ),
  /** Relationship definitions */
  relationships: z.array(CRMRelationshipSchemaZ).optional(),
  /** Page definitions */
  pages: z.array(CRMPageSchemaZ).optional(),
  /** Navigation definitions */
  navigation: CRMNavigationSchemaZ.optional(),
})

export type CRMSchema = z.infer<typeof CRMSchemaZ>

// ─────────────────────────────────────────────────────────────────────────────
// Helper function for defining schemas with type safety
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a CRM schema with full type safety.
 * Use this in .schema.ts files for type checking and autocomplete.
 *
 * @example
 * ```typescript
 * import { defineSchema } from 'skedyul'
 *
 * export default defineSchema({
 *   name: 'Gym CRM',
 *   models: [
 *     {
 *       handle: 'lead',
 *       name: 'Lead',
 *       fields: [
 *         { handle: 'first_name', label: 'First Name', type: 'string' },
 *       ],
 *     },
 *   ],
 * })
 * ```
 */
export function defineSchema(schema: CRMSchema): CRMSchema {
  return schema
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface CRMSchemaValidationResult {
  success: boolean
  data?: CRMSchema
  errors?: Array<{
    path: string
    message: string
  }>
}

/**
 * Validate a CRM schema and return detailed errors if invalid.
 */
export function validateCRMSchema(data: unknown): CRMSchemaValidationResult {
  const result = CRMSchemaZ.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))

  return { success: false, errors }
}

/**
 * Parse a CRM schema, throwing an error if invalid.
 */
export function parseCRMSchema(data: unknown): CRMSchema {
  return CRMSchemaZ.parse(data)
}

/**
 * Safely parse a CRM schema, returning null if invalid.
 */
export function safeParseCRMSchema(data: unknown): CRMSchema | null {
  const result = CRMSchemaZ.safeParse(data)
  return result.success ? result.data : null
}
