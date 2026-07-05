import { z } from 'zod/v4'

/**
 * Thread Event Types
 * These are the events that can be emitted and subscribed to in threads.
 */
export const ThreadEventTypeSchema = z.enum([
  // Message events
  'thread.message.received',
  'thread.message.sent',

  // Participant events
  'thread.participant.joined',
  'thread.participant.left',
  'thread.participant.mentioned',

  // Context events
  'thread.context.changed',
  'thread.status.changed',

  // Agent/Workflow events
  'thread.agent.delegated',
  'thread.agent.completed',
  'thread.workflow.triggered',
  'thread.workflow.completed',

  // Scheduled events
  'thread.follow_up.due',
  'thread.reminder.due',

  // Signal events
  'thread.signal.created',
])

export type ThreadEventType = z.infer<typeof ThreadEventTypeSchema>

/**
 * Custom event type pattern for app-specific events
 * e.g., "custom.payment.received", "custom.booking.confirmed"
 */
export const CustomEventTypeSchema = z.string().regex(/^custom\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, {
  message: 'Custom event type must match pattern: custom.{namespace}.{event}',
})

export type CustomEventType = z.infer<typeof CustomEventTypeSchema>

/**
 * Combined event type - either a standard thread event or a custom event
 */
export const EventTypeSchema = z.union([ThreadEventTypeSchema, CustomEventTypeSchema])

export type EventType = z.infer<typeof EventTypeSchema>

/**
 * Participant kind for event payloads
 */
export const ParticipantKindSchema = z.enum(['CONTACT', 'MEMBER', 'AGENT', 'WORKFLOW'])

export type ParticipantKind = z.infer<typeof ParticipantKindSchema>

/**
 * Base event payload structure
 */
export const BaseEventPayloadSchema = z.object({
  threadId: z.string(),
  workplaceId: z.string(),
  timestamp: z.string().datetime().optional(),
})

export type BaseEventPayload = z.infer<typeof BaseEventPayloadSchema>

/**
 * Message event payload
 */
export const MessageEventPayloadSchema = BaseEventPayloadSchema.extend({
  message: z.object({
    id: z.string(),
    content: z.string(),
    senderId: z.string().optional(),
  }),
  participant: z
    .object({
      id: z.string(),
      kind: ParticipantKindSchema,
      displayName: z.string().optional(),
    })
    .optional(),
  isFirstMessage: z.boolean().optional(),
  messageCount: z.number().optional(),
})

export type MessageEventPayload = z.infer<typeof MessageEventPayloadSchema>

/**
 * Participant event payload
 */
export const ParticipantEventPayloadSchema = BaseEventPayloadSchema.extend({
  participant: z.object({
    id: z.string(),
    kind: ParticipantKindSchema,
    displayName: z.string().optional(),
    contactId: z.string().optional(),
    memberId: z.string().optional(),
    agentId: z.string().optional(),
    workflowId: z.string().optional(),
  }),
})

export type ParticipantEventPayload = z.infer<typeof ParticipantEventPayloadSchema>

/**
 * Context changed event payload
 */
export const ContextChangedPayloadSchema = BaseEventPayloadSchema.extend({
  context: z.object({
    handle: z.string(),
    model: z.string(),
    instanceId: z.string(),
  }),
  change: z
    .object({
      field: z.string().optional(),
      oldValue: z.unknown().optional(),
      newValue: z.unknown().optional(),
    })
    .optional(),
})

export type ContextChangedPayload = z.infer<typeof ContextChangedPayloadSchema>

/**
 * Status changed event payload
 */
export const StatusChangedPayloadSchema = BaseEventPayloadSchema.extend({
  oldStatus: z.string(),
  newStatus: z.string(),
})

export type StatusChangedPayload = z.infer<typeof StatusChangedPayloadSchema>

/**
 * Scheduled event payload (follow-up, reminder)
 */
export const ScheduledEventPayloadSchema = BaseEventPayloadSchema.extend({
  scheduledEventId: z.string(),
  reason: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export type ScheduledEventPayload = z.infer<typeof ScheduledEventPayloadSchema>

/**
 * Agent/Workflow event payload
 */
export const AgentWorkflowEventPayloadSchema = BaseEventPayloadSchema.extend({
  agentId: z.string().optional(),
  workflowId: z.string().optional(),
  workflowRunId: z.string().optional(),
  outputs: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
})

export type AgentWorkflowEventPayload = z.infer<typeof AgentWorkflowEventPayloadSchema>

/**
 * Custom event payload - flexible structure for app-specific events
 */
export const CustomEventPayloadSchema = BaseEventPayloadSchema.extend({
  data: z.record(z.string(), z.unknown()).optional(),
})

export type CustomEventPayload = z.infer<typeof CustomEventPayloadSchema>

/**
 * Union of all event payloads
 */
export const ThreadEventPayloadSchema = z.union([
  MessageEventPayloadSchema,
  ParticipantEventPayloadSchema,
  ContextChangedPayloadSchema,
  StatusChangedPayloadSchema,
  ScheduledEventPayloadSchema,
  AgentWorkflowEventPayloadSchema,
  CustomEventPayloadSchema,
])

export type ThreadEventPayload = z.infer<typeof ThreadEventPayloadSchema>

/**
 * Full ThreadEvent structure (as stored in database)
 */
export const ThreadEventSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  type: EventTypeSchema,
  payload: ThreadEventPayloadSchema,
  emittedBy: z.string().optional(),
  createdAt: z.string().datetime(),
})

export type ThreadEvent = z.infer<typeof ThreadEventSchema>

/**
 * Input for creating a new ThreadEvent
 */
export const CreateThreadEventInputSchema = z.object({
  threadId: z.string(),
  type: EventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  emittedBy: z.string().optional(),
})

export type CreateThreadEventInput = z.infer<typeof CreateThreadEventInputSchema>

/**
 * Event subscription configuration (used in YAML)
 */
export const EventSubscriptionSchema = z.object({
  subscribes: z.array(EventTypeSchema),
  condition: z.string().optional(),
  cancels: z.array(EventTypeSchema).optional(),
  cancelCondition: z.string().optional(),
})

export type EventSubscription = z.infer<typeof EventSubscriptionSchema>

/**
 * Event wait configuration (for async waits)
 */
export const EventWaitSchema = z.object({
  event: EventTypeSchema,
  timeout: z.string().optional(),
  onTimeout: z.string().optional(),
})

export type EventWait = z.infer<typeof EventWaitSchema>

/**
 * Full events configuration block for YAML
 */
export const EventsConfigSchema = z.object({
  subscribes: z.array(EventTypeSchema).optional(),
  condition: z.string().optional(),
  emits: z.array(EventTypeSchema).optional(),
  waits: z.array(EventWaitSchema).optional(),
  cancels: z.array(EventTypeSchema).optional(),
  cancelCondition: z.string().optional(),
})

export type EventsConfig = z.infer<typeof EventsConfigSchema>
