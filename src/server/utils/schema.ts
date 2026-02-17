import * as z from 'zod'
import type { BillingInfo, ToolSchema, ToolSchemaWithJson } from '../../types'

/**
 * Normalizes billing info to ensure credits field exists
 */
export function normalizeBilling(billing?: BillingInfo): BillingInfo {
  if (!billing || typeof billing.credits !== 'number') {
    return { credits: 0 }
  }
  return billing
}

/**
 * Converts a Zod schema to JSON Schema format
 */
export function toJsonSchema(schema?: z.ZodTypeAny): Record<string, unknown> | undefined {
  if (!schema) return undefined
  try {
    // Zod v4 has native JSON Schema support via z.toJSONSchema()
    return z.toJSONSchema(schema, {
      unrepresentable: 'any', // Handle z.date(), z.bigint() etc gracefully
    }) as Record<string, unknown>
  } catch (err) {
    console.error('[toJsonSchema] Failed to convert schema:', err)
    return undefined
  }
}

/**
 * Type guard to check if a schema is a ToolSchemaWithJson
 */
export function isToolSchemaWithJson(
  schema: ToolSchema | undefined,
): schema is ToolSchemaWithJson {
  return Boolean(
    schema &&
      typeof schema === 'object' &&
      'zod' in schema &&
      schema.zod instanceof z.ZodType,
  )
}

/**
 * Extracts the Zod schema from a ToolSchema
 */
export function getZodSchema(schema?: ToolSchema): z.ZodTypeAny | undefined {
  if (!schema) return undefined
  if (schema instanceof z.ZodType) {
    return schema
  }
  if (isToolSchemaWithJson(schema)) {
    return schema.zod
  }
  return undefined
}

/**
 * Gets JSON schema from a ToolSchema, either from explicit jsonSchema or by converting Zod
 */
export function getJsonSchemaFromToolSchema(
  schema?: ToolSchema,
): Record<string, unknown> | undefined {
  if (!schema) return undefined

  if (isToolSchemaWithJson(schema) && schema.jsonSchema) {
    return schema.jsonSchema
  }

  const zodSchema = getZodSchema(schema)
  return toJsonSchema(zodSchema)
}
