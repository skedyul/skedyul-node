import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  CRMSchemaZ,
  validateCRMSchema,
  type CRMSchema,
  type CRMSchemaValidationResult,
} from '../schemas/crm-schema'

// ─────────────────────────────────────────────────────────────────────────────
// Schema File Names
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEMA_FILE_EXTENSIONS = ['.schema.ts', '.schema.json']

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript Transpilation (simplified for schema files)
// ─────────────────────────────────────────────────────────────────────────────

async function transpileSchemaTypeScript(filePath: string): Promise<string> {
  const content = fs.readFileSync(filePath, 'utf-8')

  let transpiled = content
    // Remove type imports
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?\n?/g, '')
    // Remove defineSchema import
    .replace(/import\s+\{\s*defineSchema\s*\}\s+from\s+['"]skedyul['"]\s*;?\n?/g, '')
    // Remove type annotations
    .replace(/:\s*CRMSchema/g, '')
    // Convert export default to module.exports
    .replace(/export\s+default\s+/, 'module.exports = ')
    // Remove defineSchema wrapper
    .replace(/defineSchema\s*\(\s*\{/, '{')
    .replace(/\}\s*\)\s*;?\s*$/, '}')

  return transpiled
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Loading
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadSchemaOptions {
  /** Validate the schema after loading (default: true) */
  validate?: boolean
}

export interface LoadSchemaResult {
  schema: CRMSchema
  filePath: string
  format: 'typescript' | 'json'
}

/**
 * Load a CRM schema from a file.
 * Supports both .schema.ts (TypeScript) and .schema.json (JSON) formats.
 *
 * @param schemaPath - Path to the schema file
 * @param options - Loading options
 * @returns The loaded and validated schema
 * @throws Error if the file doesn't exist, can't be parsed, or fails validation
 */
export async function loadSchema(
  schemaPath: string,
  options: LoadSchemaOptions = {},
): Promise<LoadSchemaResult> {
  const { validate = true } = options
  const absolutePath = path.resolve(schemaPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Schema file not found: ${absolutePath}`)
  }

  const isTypeScript = absolutePath.endsWith('.ts')
  const isJson = absolutePath.endsWith('.json')

  if (!isTypeScript && !isJson) {
    throw new Error(
      `Unsupported schema file format: ${path.extname(absolutePath)}. Use .schema.ts or .schema.json`,
    )
  }

  let rawSchema: unknown

  try {
    if (isJson) {
      const content = fs.readFileSync(absolutePath, 'utf-8')
      rawSchema = JSON.parse(content)
    } else {
      // TypeScript file
      const transpiled = await transpileSchemaTypeScript(absolutePath)
      const tempDir = os.tmpdir()
      const tempFile = path.join(tempDir, `skedyul-schema-${Date.now()}.cjs`)
      fs.writeFileSync(tempFile, transpiled)

      try {
        const module = require(tempFile)
        rawSchema = module.default || module
      } finally {
        try {
          fs.unlinkSync(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to load schema from ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!rawSchema || typeof rawSchema !== 'object') {
    throw new Error('Schema file must export a schema object')
  }

  if (validate) {
    const validation = validateCRMSchema(rawSchema)
    if (!validation.success) {
      const errorMessages = validation.errors
        ?.map((e) => `  - ${e.path}: ${e.message}`)
        .join('\n')
      throw new Error(`Schema validation failed:\n${errorMessages}`)
    }
    return {
      schema: validation.data!,
      filePath: absolutePath,
      format: isTypeScript ? 'typescript' : 'json',
    }
  }

  return {
    schema: rawSchema as CRMSchema,
    filePath: absolutePath,
    format: isTypeScript ? 'typescript' : 'json',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Serialization
// ─────────────────────────────────────────────────────────────────────────────

export interface SerializeSchemaOptions {
  /** Include $schema field in JSON output (default: true) */
  includeSchemaUrl?: boolean
  /** Pretty print JSON (default: true) */
  pretty?: boolean
}

/**
 * Serialize a CRM schema to JSON string.
 */
export function serializeSchemaToJson(
  schema: CRMSchema,
  options: SerializeSchemaOptions = {},
): string {
  const { includeSchemaUrl = true, pretty = true } = options

  const output: CRMSchema = includeSchemaUrl
    ? { $schema: 'https://skedyul.com/schemas/crm/v1', ...schema }
    : schema

  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)
}

/**
 * Serialize a CRM schema to TypeScript string.
 */
export function serializeSchemaToTypeScript(schema: CRMSchema): string {
  const jsonContent = JSON.stringify(schema, null, 2)
    // Indent the JSON content
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n')

  return `import { defineSchema } from 'skedyul'

export default defineSchema(${jsonContent})
`
}

/**
 * Save a CRM schema to a file.
 * Format is determined by file extension.
 */
export async function saveSchema(
  schema: CRMSchema,
  outputPath: string,
  options: SerializeSchemaOptions = {},
): Promise<void> {
  const absolutePath = path.resolve(outputPath)
  const isTypeScript = absolutePath.endsWith('.ts')

  const content = isTypeScript
    ? serializeSchemaToTypeScript(schema)
    : serializeSchemaToJson(schema, options)

  fs.writeFileSync(absolutePath, content, 'utf-8')
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend Format Transformation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Field type mapping from CRM schema (lowercase) to backend (uppercase).
 */
const FIELD_TYPE_MAP: Record<string, string> = {
  string: 'STRING',
  long_string: 'LONG_STRING',
  number: 'NUMBER',
  boolean: 'BOOLEAN',
  date: 'DATE',
  datetime: 'DATE_TIME',
  time: 'TIME',
  file: 'FILE',
  image: 'IMAGE',
  object: 'OBJECT',
}

/**
 * Field requirement mapping from CRM schema to backend.
 */
const FIELD_REQUIREMENT_MAP: Record<string, string> = {
  optional: 'OPTIONAL',
  on_create: 'ON_CREATE',
  required: 'REQUIRED',
}

/**
 * Cardinality mapping from CRM schema to backend.
 */
const CARDINALITY_MAP: Record<string, string> = {
  one_to_one: 'ONE_TO_ONE',
  one_to_many: 'ONE_TO_MANY',
}

/**
 * On delete mapping from CRM schema to backend.
 */
const ON_DELETE_MAP: Record<string, string> = {
  none: 'NONE',
  cascade: 'CASCADE',
  restrict: 'RESTRICT',
}

/**
 * Page type mapping from CRM schema to backend.
 */
const PAGE_TYPE_MAP: Record<string, string> = {
  list: 'LIST',
  instance: 'INSTANCE',
}

/**
 * Block type mapping from CRM schema to backend.
 */
const BLOCK_TYPE_MAP: Record<string, string> = {
  spreadsheet: 'SPREADSHEET',
  form: 'FORM',
  card: 'CARD',
  metric: 'METRIC',
  kanban: 'KANBAN',
}

/**
 * Backend-compatible model definition.
 */
export interface BackendModelDefinition {
  handle: string
  name: string
  namePlural?: string
  labelTemplate: string
  description?: string
  icon?: string
  fields?: BackendFieldDefinition[]
}

/**
 * Backend-compatible field definition.
 */
export interface BackendFieldDefinition {
  handle: string
  label: string
  type: string
  helpText?: string | null
  isList?: boolean
  isUnique?: boolean
  requirement?: string
  defaultValue?: {
    value: unknown[]
  }
  definition?: string | {
    type: string
    options?: Array<{ value: string; label: string; color?: string | null }>
  }
}

/**
 * Backend-compatible relationship definition.
 */
export interface BackendRelationshipDefinition {
  source: { model: string; field: string; label: string }
  target: { model: string; field: string; label: string }
  cardinality: string
  onDelete?: string
}

/**
 * Backend-compatible block definition.
 */
export interface BackendBlockDefinition {
  type: string
  title?: string
  config?: unknown
  default?: boolean
}

/**
 * Backend-compatible page definition.
 */
export interface BackendPageDefinition {
  path: string
  type: string
  title: string
  icon?: string
  modelHandle: string
  parentPath?: string
  baseQuery?: unknown
  blocks?: BackendBlockDefinition[]
}

/**
 * Backend-compatible navigation item definition.
 */
export interface BackendNavigationItemDefinition {
  label: string
  icon?: string
  path: string
  sortIndex?: number
}

/**
 * Backend-compatible navigation definition.
 */
export interface BackendNavigationDefinition {
  sidebar?: BackendNavigationItemDefinition[]
}

/**
 * Backend-compatible desired schema format.
 */
export interface BackendDesiredSchema {
  models: BackendModelDefinition[]
  relationships: BackendRelationshipDefinition[]
  fieldDefinitions: Array<{
    handle: string
    type: string
    options?: Array<{ value: string; label: string; color?: string | null }>
  }>
  pages?: BackendPageDefinition[]
  navigation?: BackendNavigationDefinition
}

/**
 * Transform a CRM schema to the backend's DesiredSchema format.
 */
export function transformToBackendSchema(schema: CRMSchema): BackendDesiredSchema {
  const fieldDefinitions: BackendDesiredSchema['fieldDefinitions'] = []

  const models: BackendModelDefinition[] = schema.models.map((model) => {
    const fields: BackendFieldDefinition[] = model.fields.map((field) => {
      const backendField: BackendFieldDefinition = {
        handle: field.handle,
        label: field.label,
        type: FIELD_TYPE_MAP[field.type] || field.type.toUpperCase(),
        helpText: field.description || null,
        isList: field.list,
        isUnique: field.unique,
        requirement: field.requirement
          ? FIELD_REQUIREMENT_MAP[field.requirement]
          : undefined,
      }

      if (field.default !== undefined) {
        backendField.defaultValue = {
          value: Array.isArray(field.default) ? field.default : [field.default],
        }
      }

      // Handle field definition - can be a string (built-in) or an object with options
      if (field.definition) {
        if (typeof field.definition === 'string') {
          // Built-in definition (e.g., "email", "phone")
          backendField.definition = field.definition
        } else if (field.definition.options && field.definition.options.length > 0) {
          const definitionHandle = `${model.handle}_${field.handle}`
          backendField.definition = {
            type: FIELD_TYPE_MAP[field.type] || field.type.toUpperCase(),
            options: field.definition.options.map((opt) => ({
              value: opt.value,
              label: opt.label,
              color: opt.color || null,
            })),
          }

          // Also add to top-level field definitions
          fieldDefinitions.push({
            handle: definitionHandle,
            type: FIELD_TYPE_MAP[field.type] || field.type.toUpperCase(),
            options: field.definition.options.map((opt) => ({
              value: opt.value,
              label: opt.label,
              color: opt.color || null,
            })),
          })
        }
      }

      return backendField
    })

    return {
      handle: model.handle,
      name: model.name,
      namePlural: model.namePlural,
      labelTemplate: model.labelTemplate || `{{ ${model.fields[0]?.handle || 'id'} }}`,
      description: model.description,
      icon: model.icon,
      fields,
    }
  })

  const relationships: BackendRelationshipDefinition[] = (schema.relationships || []).map(
    (rel) => ({
      source: rel.source,
      target: rel.target,
      cardinality: CARDINALITY_MAP[rel.cardinality] || rel.cardinality.toUpperCase(),
      onDelete: rel.onDelete ? ON_DELETE_MAP[rel.onDelete] : undefined,
    }),
  )

  const pages: BackendPageDefinition[] = (schema.pages || []).map((page) => ({
    path: page.path,
    type: PAGE_TYPE_MAP[page.type] || page.type.toUpperCase(),
    title: page.title,
    icon: page.icon,
    modelHandle: page.modelHandle,
    parentPath: page.parentPath,
    baseQuery: page.baseQuery,
    blocks: page.blocks?.map((block) => ({
      type: BLOCK_TYPE_MAP[block.type] || block.type.toUpperCase(),
      title: block.title,
      config: block.config,
      default: block.default,
    })),
  }))

  const navigation: BackendNavigationDefinition | undefined = schema.navigation
    ? {
        sidebar: schema.navigation.sidebar?.map((item) => ({
          label: item.label,
          icon: item.icon,
          path: item.path,
          sortIndex: item.sortIndex,
        })),
      }
    : undefined

  return {
    models,
    relationships,
    fieldDefinitions,
    pages,
    navigation,
  }
}

/**
 * Transform a backend schema to CRM schema format.
 * Used when pulling schema from a workplace.
 */
export function transformFromBackendSchema(
  backendSchema: BackendDesiredSchema,
  name: string,
  description?: string,
  version?: string,
): CRMSchema {
  const reverseFieldTypeMap: Record<string, string> = Object.fromEntries(
    Object.entries(FIELD_TYPE_MAP).map(([k, v]) => [v, k]),
  )

  const reverseRequirementMap: Record<string, string> = Object.fromEntries(
    Object.entries(FIELD_REQUIREMENT_MAP).map(([k, v]) => [v, k]),
  )

  const reverseCardinalityMap: Record<string, string> = Object.fromEntries(
    Object.entries(CARDINALITY_MAP).map(([k, v]) => [v, k]),
  )

  const reverseOnDeleteMap: Record<string, string> = Object.fromEntries(
    Object.entries(ON_DELETE_MAP).map(([k, v]) => [v, k]),
  )

  const reversePageTypeMap: Record<string, string> = Object.fromEntries(
    Object.entries(PAGE_TYPE_MAP).map(([k, v]) => [v, k]),
  )

  const reverseBlockTypeMap: Record<string, string> = Object.fromEntries(
    Object.entries(BLOCK_TYPE_MAP).map(([k, v]) => [v, k]),
  )

  const models = backendSchema.models.map((model) => ({
    handle: model.handle,
    name: model.name,
    namePlural: model.namePlural,
    labelTemplate: model.labelTemplate,
    description: model.description,
    icon: model.icon,
    fields: (model.fields || []).map((field) => ({
      handle: field.handle,
      label: field.label,
      type: (reverseFieldTypeMap[field.type] || field.type.toLowerCase()) as any,
      description: field.helpText || undefined,
      requirement: field.requirement
        ? (reverseRequirementMap[field.requirement] as any)
        : undefined,
      unique: field.isUnique,
      list: field.isList,
      default: field.defaultValue?.value?.[0],
      definition: field.definition
        ? typeof field.definition === 'string'
          ? field.definition // Built-in definition like "email", "phone"
          : field.definition.options
            ? {
                options: field.definition.options.map((opt) => ({
                  label: opt.label,
                  value: opt.value,
                  color: opt.color || undefined,
                })),
              }
            : undefined
        : undefined,
    })),
  }))

  const relationships = backendSchema.relationships.map((rel) => ({
    source: rel.source,
    target: rel.target,
    cardinality: (reverseCardinalityMap[rel.cardinality] ||
      rel.cardinality.toLowerCase()) as any,
    onDelete: rel.onDelete
      ? (reverseOnDeleteMap[rel.onDelete] as any)
      : undefined,
  }))

  const pages = (backendSchema.pages || []).map((page) => ({
    path: page.path,
    type: (reversePageTypeMap[page.type] || page.type.toLowerCase()) as any,
    title: page.title,
    icon: page.icon,
    modelHandle: page.modelHandle,
    parentPath: page.parentPath,
    baseQuery: page.baseQuery,
    blocks: page.blocks?.map((block) => ({
      type: (reverseBlockTypeMap[block.type] || block.type.toLowerCase()) as any,
      title: block.title,
      config: block.config,
      default: block.default,
    })),
  }))

  const navigation = backendSchema.navigation
    ? {
        sidebar: backendSchema.navigation.sidebar?.map((item) => ({
          label: item.label,
          icon: item.icon,
          path: item.path,
          sortIndex: item.sortIndex,
        })),
      }
    : undefined

  return {
    $schema: 'https://skedyul.com/schemas/crm/v1',
    name,
    description,
    version,
    models,
    relationships: relationships.length > 0 ? relationships : undefined,
    pages: pages.length > 0 ? pages : undefined,
    navigation,
  }
}
