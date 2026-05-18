import { z } from 'zod/v4'
import { EventTypeSchema, ParticipantKindSchema } from '../events/types'

/**
 * CRM data structure for context resolution
 */
export const CRMDataSchema = z.object({
  model: z.string(),
  instanceId: z.string(),
  data: z.record(z.string(), z.unknown()),
})

export type CRMData = z.infer<typeof CRMDataSchema>

/**
 * Sender context - who sent the triggering message/event
 */
export const SenderContextSchema = z.object({
  kind: ParticipantKindSchema,
  displayName: z.string().optional(),
  crm: CRMDataSchema.optional(),
})

export type SenderContext = z.infer<typeof SenderContextSchema>

/**
 * Thread context - linked CRM instances
 */
export const ThreadContextItemSchema = z.object({
  handle: z.string(),
  model: z.string(),
  instanceId: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
})

export type ThreadContextItem = z.infer<typeof ThreadContextItemSchema>

/**
 * Participant in thread context
 */
export const ParticipantContextSchema = z.object({
  id: z.string(),
  kind: ParticipantKindSchema,
  displayName: z.string().optional(),
  contactId: z.string().optional(),
  memberId: z.string().optional(),
  agentId: z.string().optional(),
  workflowId: z.string().optional(),
})

export type ParticipantContext = z.infer<typeof ParticipantContextSchema>

/**
 * Full trigger context - available for input mapping evaluation
 */
export const TriggerContextSchema = z.object({
  // The event that triggered this
  event: z.object({
    type: EventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
    participant: ParticipantContextSchema.optional(),
  }),

  // Thread information
  thread: z.object({
    id: z.string(),
    title: z.string().optional(),
    status: z.string().optional(),
    sender: SenderContextSchema.optional(),
    context: z.record(z.string(), CRMDataSchema).optional(),
    participants: z.array(ParticipantContextSchema).optional(),
  }),

  // Workplace info
  workplace: z.object({
    id: z.string(),
    name: z.string().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),
})

export type TriggerContext = z.infer<typeof TriggerContextSchema>

/**
 * Input mapping - Liquid template string that resolves to a value
 * e.g., "{{ thread.sender.crm }}" or "{{ thread.context.Customer }}"
 */
export const InputMappingSchema = z.record(z.string(), z.string())

export type InputMapping = z.infer<typeof InputMappingSchema>

/**
 * Event conditions - per-event-type conditions
 * e.g., { "thread.participant.joined": "{{ event.participant.kind == 'CONTACT' }}" }
 */
export const EventConditionsSchema = z.record(z.string(), z.string())

export type EventConditions = z.infer<typeof EventConditionsSchema>

/**
 * Trigger configuration (stored in database)
 */
export const TriggerConfigSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowVersionId: z.string().optional(),
  workplaceId: z.string(),
  handle: z.string(),

  // Input mappings: how to resolve workflow inputs from thread context
  inputMappings: InputMappingSchema.optional(),

  // Event conditions: additional workplace-specific conditions
  eventConditions: EventConditionsSchema.optional(),

  // Workplace-specific config overrides
  config: z.record(z.string(), z.unknown()).optional(),

  // Trigger type and status
  type: z.string().optional(),
  isEnabled: z.boolean().optional(),
})

export type TriggerConfig = z.infer<typeof TriggerConfigSchema>

/**
 * Resolved trigger - after input mappings have been evaluated
 */
export const ResolvedTriggerSchema = z.object({
  trigger: TriggerConfigSchema,
  workflow: z.object({
    id: z.string(),
    handle: z.string(),
    name: z.string().optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
    events: z
      .object({
        subscribes: z.array(EventTypeSchema).optional(),
        condition: z.string().optional(),
      })
      .optional(),
  }),
  inputs: z.record(z.string(), z.unknown()),
  context: TriggerContextSchema,
})

export type ResolvedTrigger = z.infer<typeof ResolvedTriggerSchema>

/**
 * Trigger resolution error
 */
export class TriggerResolutionError extends Error {
  constructor(
    message: string,
    public readonly triggerId?: string,
    public readonly inputName?: string,
  ) {
    super(message)
    this.name = 'TriggerResolutionError'
  }
}

/**
 * Workflow input schema definition
 */
export const WorkflowInputDefinitionSchema = z.object({
  type: z.string(),
  required: z.boolean().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
})

export type WorkflowInputDefinition = z.infer<typeof WorkflowInputDefinitionSchema>

/**
 * Workflow input schema (map of input name to definition)
 */
export const WorkflowInputSchemaSchema = z.record(z.string(), WorkflowInputDefinitionSchema)

export type WorkflowInputSchema = z.infer<typeof WorkflowInputSchemaSchema>
