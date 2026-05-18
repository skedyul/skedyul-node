import { z } from 'zod/v4'
import { EventsConfigSchema, EventTypeSchema } from '../events/types'
import { WorkflowInputDefinitionSchema } from '../triggers/types'

/**
 * Workflow YAML schema version
 */
export const WORKFLOW_SCHEMA_VERSION = 'https://skedyul.com/schemas/workflow/v1'

/**
 * Workflow input definition (what inputs the workflow needs)
 */
export const WorkflowInputSchema = z.object({
  type: z.string(),
  required: z.boolean().optional().default(false),
  description: z.string().optional(),
  default: z.unknown().optional(),
})

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>

/**
 * Workflow step input - can be a literal value or a Liquid template
 */
export const WorkflowStepInputSchema = z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())])

export type WorkflowStepInput = z.infer<typeof WorkflowStepInputSchema>

/**
 * Workflow step definition
 */
export const WorkflowStepSchema = z.object({
  // Service and command
  service: z.string(),
  cmd: z.string(),

  // Dependencies
  needs: z.array(z.string()).optional(),

  // Inputs (Liquid templates supported)
  inputs: z.record(z.string(), WorkflowStepInputSchema).optional(),

  // Conditional execution
  condition: z.string().optional(),

  // Retry configuration
  retry: z
    .object({
      attempts: z.number().optional(),
      backoff: z.enum(['linear', 'exponential']).optional(),
    })
    .optional(),

  // Timeout
  timeout: z.string().optional(),
})

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

/**
 * Workflow runtime configuration
 */
export const WorkflowRuntimeSchema = z.object({
  durable: z.boolean().optional().default(true),
  timeout: z.string().optional(),
  retry: z
    .object({
      attempts: z.number().optional(),
      backoff: z.enum(['linear', 'exponential']).optional(),
    })
    .optional(),
})

export type WorkflowRuntime = z.infer<typeof WorkflowRuntimeSchema>

/**
 * Full Workflow YAML schema (v2 - event-driven)
 */
export const WorkflowYAMLSchema = z.object({
  // Schema version
  $schema: z.string().optional(),

  // Identity
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),

  // Inputs this workflow needs (portable, declared in YAML)
  inputs: z.record(z.string(), WorkflowInputSchema).optional(),

  // Event subscriptions and conditions
  events: EventsConfigSchema.optional(),

  // Deterministic steps
  steps: z.record(z.string(), WorkflowStepSchema),

  // Runtime configuration
  runtime: WorkflowRuntimeSchema.optional(),
})

export type WorkflowYAML = z.infer<typeof WorkflowYAMLSchema>

/**
 * Workflow file metadata (for registry)
 */
export const WorkflowMetadataSchema = z.object({
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  inputs: z.record(z.string(), WorkflowInputDefinitionSchema).optional(),
  events: EventsConfigSchema.optional(),
})

export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>

/**
 * Workflow execution status
 */
export const WorkflowExecutionStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'WAITING',
])

export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusSchema>

/**
 * Workflow execution result
 */
export const WorkflowExecutionResultSchema = z.object({
  status: WorkflowExecutionStatusSchema,
  outputs: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  cancelReason: z.string().optional(),
})

export type WorkflowExecutionResult = z.infer<typeof WorkflowExecutionResultSchema>

/**
 * Helper function to define a workflow with type safety
 */
export function defineWorkflowYAML(workflow: WorkflowYAML): WorkflowYAML {
  return WorkflowYAMLSchema.parse(workflow)
}

/**
 * Validate a workflow YAML object
 */
export function validateWorkflowYAML(workflow: unknown): { success: true; data: WorkflowYAML } | { success: false; error: z.ZodError } {
  const result = WorkflowYAMLSchema.safeParse(workflow)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}
