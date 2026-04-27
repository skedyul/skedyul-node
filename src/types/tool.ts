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

export interface BillingInfo {
  credits: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Completion Hints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hints for controlling tool completion behavior in agent loops.
 * Used to prevent duplicate calls and determine when to stop tool execution.
 */
export interface ToolCompletionHints {
  /** Maximum times this tool can be called per agent run. Default: unlimited */
  maxCallsPerRun?: number
  /** If true, tool is safe to call multiple times with same args (no side effects) */
  idempotent?: boolean
}

/**
 * Configuration options for tool execution behavior.
 * Groups timeout, retry, and completion hint settings.
 */
export interface ToolConfig {
  /** Timeout in milliseconds. Defaults to 10000 (10 seconds) if not specified. */
  timeout?: number
  /** Maximum retry attempts. Defaults to 1 (no retries) if not specified. */
  retries?: number
  /** Hints for controlling tool completion behavior in agent loops */
  completionHints?: ToolCompletionHints
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Response Meta
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standardized metadata for tool responses.
 * Provides consistent structure for AI evaluation, logging, and debugging.
 */
export const ToolResponseMetaSchema = z.object({
  /** Whether the tool execution succeeded */
  success: z.boolean(),
  /** Human-readable message describing the result or error */
  message: z.string(),
  /** Name of the tool that was executed */
  toolName: z.string(),
})

export type ToolResponseMeta = z.infer<typeof ToolResponseMetaSchema>

/**
 * Client-side effects that the tool wants the UI to execute.
 * These are separate from the data output and represent navigation/UI actions.
 */
export interface ToolEffect {
  /** URL to navigate to after the tool completes */
  redirect?: string
}

/**
 * Structured error information for tool execution results.
 * Uses codes for serialization and workflow detection.
 */
export interface ToolError {
  code: string
  message: string
}

export interface ToolExecutionResult<Output = unknown> {
  /** Tool-specific output data. Null on error. */
  output: Output | null
  /** Billing information */
  billing: BillingInfo
  /** Standardized response metadata for AI evaluation and debugging */
  meta: ToolResponseMeta
  /** Optional client-side effects to execute */
  effect?: ToolEffect
  /** Structured error information (null/undefined if no error) */
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
 */
export type ToolHandler<Input, Output> = (
  input: Input,
  context: ToolExecutionContext,
) => Promise<ToolExecutionResult<Output>> | ToolExecutionResult<Output>

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
  /** Tool execution configuration (timeout, retries, completion hints) */
  config?: ToolConfig
  [key: string]: unknown
}

export interface ToolRegistryEntry {
  name: string
  label?: string
  description: string
  inputSchema: ToolSchema
  handler: unknown
  outputSchema?: ToolSchema
  /** Tool execution configuration (timeout, retries, completion hints) */
  config?: ToolConfig
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
  /** Tool execution configuration (timeout, retries, completion hints) */
  config?: ToolConfig
}

/**
 * Response from a tool call.
 * Alias for ToolExecutionResult<unknown> for backwards compatibility.
 */
export type ToolCallResponse = ToolExecutionResult<unknown>
