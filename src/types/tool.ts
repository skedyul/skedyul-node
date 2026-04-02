import { z } from 'zod/v4'
import type { ToolExecutionContext } from './tool-context'

// ─────────────────────────────────────────────────────────────────────────────
// Tool Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input type for Provision lifecycle tools (onProvision, onDeprovision).
 * These tools receive no user input - all data comes from context.
 */
export type ProvisionToolInput = Record<string, never>

// ─────────────────────────────────────────────────────────────────────────────
// New Tool Result Types (Discriminated Union)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standardized error codes for consistent handling across tools.
 * Custom codes are allowed for tool-specific errors.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'CONFLICT'
  | string

/**
 * Error category for smart retry logic.
 * - validation: Don't retry, fix the input
 * - auth: May need user action (re-login)
 * - network: Retry with backoff
 * - timeout: Retry with longer timeout
 * - external: Retry with backoff
 * - internal: May retry, but likely a bug
 */
export type ErrorCategory =
  | 'validation'
  | 'auth'
  | 'network'
  | 'timeout'
  | 'external'
  | 'internal'

/**
 * Structured error information with category for smart retry logic.
 */
export interface ToolError {
  code: ErrorCode
  message: string
  category?: ErrorCategory
  field?: string
  details?: Record<string, unknown>
}

/**
 * Retry guidance for transient failures.
 */
export interface ToolRetry {
  allowed: boolean
  afterMs?: number
  maxAttempts?: number
}

/**
 * Non-fatal warning that doesn't prevent success.
 */
export interface ToolWarning {
  code: string
  message: string
  field?: string
}

/**
 * Pagination metadata for list operations.
 */
export interface ToolPagination {
  hasMore: boolean
  total?: number
  nextCursor?: string
  page?: number
  limit?: number
}

/**
 * Billing/usage information.
 */
export interface ToolBilling {
  credits: number
  tokens?: number
  cost?: number
}

/**
 * Client-side effects to execute after tool completion.
 */
export interface ToolEffect {
  redirect?: string
  toast?: {
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
  }
  refresh?: string[]
}

/**
 * Execution timing for observability.
 */
export interface ToolTiming {
  durationMs: number
}

/**
 * Successful tool execution result.
 * Output is guaranteed to exist.
 */
export interface ToolSuccess<T = unknown> {
  success: true
  output: T
  warnings?: ToolWarning[]
  pagination?: ToolPagination
  billing?: ToolBilling
  effect?: ToolEffect
  timing?: ToolTiming
}

/**
 * Failed tool execution result.
 * Error is guaranteed to exist, output is not available.
 */
export interface ToolFailure {
  success: false
  error: ToolError
  retry?: ToolRetry
  partialOutput?: unknown
  billing?: ToolBilling
  effect?: ToolEffect
  timing?: ToolTiming
}

/**
 * Tool execution result - either success or failure.
 * Use `result.success` to narrow the type.
 *
 * @example
 * ```ts
 * const result = await tool.handler(input, context)
 * if (result.success) {
 *   console.log(result.output) // TypeScript knows output exists
 * } else {
 *   console.log(result.error.code) // TypeScript knows error exists
 * }
 * ```
 */
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Types (Backward Compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use ToolBilling instead
 */
export interface BillingInfo {
  credits: number
}

/**
 * Standardized metadata for tool responses.
 * @deprecated Use ToolResult discriminated union instead
 */
export const ToolResponseMetaSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  toolName: z.string(),
})

/**
 * @deprecated Use ToolResult discriminated union instead
 */
export type ToolResponseMeta = z.infer<typeof ToolResponseMetaSchema>

/**
 * Legacy tool execution result type.
 * @deprecated Use ToolResult<T> instead. This type is kept for backward compatibility.
 */
export interface ToolExecutionResult<Output = unknown> {
  output: Output | null
  billing: BillingInfo
  meta: ToolResponseMeta
  effect?: ToolEffect
  error?: ToolError | null
}

export interface ToolSchemaWithJson<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  zod: Schema
  jsonSchema?: Record<string, unknown>
}

export type ToolSchema<Schema extends z.ZodTypeAny = z.ZodTypeAny> = Schema | ToolSchemaWithJson<Schema>

/**
 * Tool handler function signature.
 * Receives tool-specific input as first argument and standardized context as second.
 * Supports both new ToolResult and legacy ToolExecutionResult return types.
 */
export type ToolHandler<Input, Output> = (
  input: Input,
  context: ToolExecutionContext,
) => Promise<ToolResult<Output> | ToolExecutionResult<Output>> | ToolResult<Output> | ToolExecutionResult<Output>

export interface ToolDefinition<
  Input = unknown,
  Output = unknown,
  InputSchema extends z.ZodTypeAny = z.ZodType<Input>,
  OutputSchema extends z.ZodTypeAny = z.ZodType<Output>,
> {
  name: string
  label?: string
  description: string
  inputSchema: ToolSchema<InputSchema>
  handler: ToolHandler<Input, Output>
  outputSchema?: ToolSchema<OutputSchema>
  /** Timeout in milliseconds. Defaults to 10000 (10 seconds) if not specified. */
  timeout?: number
  /** Maximum retry attempts. Defaults to 1 (no retries) if not specified. */
  retries?: number
  [key: string]: unknown
}

export interface ToolRegistryEntry {
  name: string
  label?: string
  description: string
  inputSchema: ToolSchema
  handler: unknown
  outputSchema?: ToolSchema
  [key: string]: unknown
}

export type ToolRegistry = Record<string, ToolRegistryEntry>

export type ToolName<T extends ToolRegistry> = Extract<keyof T, string>

export interface ToolMetadata {
  name: string
  displayName?: string
  description: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  /** Timeout in milliseconds. Defaults to 10000 (10 seconds) if not specified. */
  timeout?: number
  /** Maximum retry attempts. Defaults to 1 (no retries) if not specified. */
  retries?: number
}

/**
 * Response from a tool call.
 * Alias for ToolExecutionResult<unknown> for backwards compatibility.
 */
export type ToolCallResponse = ToolExecutionResult<unknown>
