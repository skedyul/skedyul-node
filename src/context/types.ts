import { z } from 'zod/v4'
import { ParticipantKindSchema } from '../events/types'

/**
 * CRM context - data from a CRM instance
 */
export const CRMContextSchema = z.object({
  model: z.string(),
  instanceId: z.string(),
  data: z.record(z.string(), z.unknown()),
})

export type CRMContext = z.infer<typeof CRMContextSchema>

/**
 * Sender context - who sent the message (legacy, kept for backwards compatibility)
 */
export const SenderContextSchema = z.object({
  kind: ParticipantKindSchema,
  displayName: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  crm: CRMContextSchema.optional(),
})

export type SenderContext = z.infer<typeof SenderContextSchema>

/**
 * Thread context item - a linked CRM instance
 */
export const ThreadContextItemSchema = z.object({
  handle: z.string(),
  model: z.string(),
  instanceId: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
})

export type ThreadContextItem = z.infer<typeof ThreadContextItemSchema>

/**
 * Thread info in context
 */
export const ThreadInfoSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
})

export type ThreadInfo = z.infer<typeof ThreadInfoSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Agent Context - Unified context for both sandbox and production
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscription - channel identifier for the contact
 */
export const SubscriptionSchema = z.object({
  identifierValue: z.string(),
  channelHandle: z.string().optional(),
})

export type Subscription = z.infer<typeof SubscriptionSchema>

/**
 * Association - CRM instance linked to a contact
 */
export const AssociationSchema = z.object({
  id: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
})

export type Association = z.infer<typeof AssociationSchema>

/**
 * Contact - mirrors production contact structure
 */
export const ContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  subscription: SubscriptionSchema.optional(),
  associations: z.record(z.string(), AssociationSchema).optional(),
})

export type Contact = z.infer<typeof ContactSchema>

/**
 * Agent sender context - who sent the message
 */
export const AgentSenderContextSchema = z.object({
  kind: z.enum(['contact', 'member']),
  displayName: z.string().optional(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  contact: ContactSchema.optional(),
})

export type AgentSenderContext = z.infer<typeof AgentSenderContextSchema>

/**
 * Agent thread context item - a linked CRM instance
 */
export const AgentThreadContextSchema = z.object({
  handle: z.string(),
  model: z.string(),
  data: z.record(z.string(), z.unknown()),
})

export type AgentThreadContext = z.infer<typeof AgentThreadContextSchema>

/**
 * Agent context - unified context for both sandbox and production
 * 
 * This is the primary context shape used by agents. It can be:
 * - Built from real thread data (production mode)
 * - Loaded from agent YAML mockContext (sandbox mode)
 */
export const AgentContextSchema = z.object({
  sender: AgentSenderContextSchema,
  contexts: z.array(AgentThreadContextSchema).optional(),
})

export type AgentContext = z.infer<typeof AgentContextSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Context Validation - Detect missing/misconfigured agent context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Severity level for context validation issues.
 * - ERROR: Critical issue - agent cannot run (e.g., missing required field)
 * - WARNING: Non-critical issue - agent runs degraded (e.g., missing recommended field)
 */
export const ContextIssueSeveritySchema = z.enum(['ERROR', 'WARNING'])

export type ContextIssueSeverity = z.infer<typeof ContextIssueSeveritySchema>

/**
 * Type of context validation issue.
 */
export const ContextIssueTypeSchema = z.enum([
  'MISSING_ROUTING_PARTICIPANT',
  'MISSING_ASSOCIATION',
  'MISSING_REQUIRED_FIELD',
  'MISSING_RECOMMENDED_FIELD',
])

export type ContextIssueType = z.infer<typeof ContextIssueTypeSchema>

/**
 * A single validation issue found during context validation.
 */
export const ContextIssueSchema = z.object({
  type: ContextIssueTypeSchema,
  severity: ContextIssueSeveritySchema,
  model: z.string().optional(),
  field: z.string().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
})

export type ContextIssue = z.infer<typeof ContextIssueSchema>

/**
 * Result of context validation.
 * - valid: false if any ERROR-level issues exist (agent should not run)
 * - degraded: true if any WARNING-level issues exist (agent runs with reduced performance)
 * - issues: List of all validation issues found
 */
export const ContextValidationResultSchema = z.object({
  valid: z.boolean(),
  degraded: z.boolean(),
  issues: z.array(ContextIssueSchema),
})

export type ContextValidationResult = z.infer<typeof ContextValidationResultSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Mock* aliases (deprecated, kept for backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use SubscriptionSchema instead */
export const MockSubscriptionSchema = SubscriptionSchema
/** @deprecated Use Subscription instead */
export type MockSubscription = Subscription

/** @deprecated Use AssociationSchema instead */
export const MockAssociationSchema = AssociationSchema
/** @deprecated Use Association instead */
export type MockAssociation = Association

/** @deprecated Use ContactSchema instead */
export const MockContactSchema = ContactSchema
/** @deprecated Use Contact instead */
export type MockContact = Contact

/** @deprecated Use AgentSenderContextSchema instead */
export const MockSenderContextSchema = AgentSenderContextSchema
/** @deprecated Use AgentSenderContext instead */
export type MockSenderContext = AgentSenderContext

/** @deprecated Use AgentThreadContextSchema instead */
export const MockThreadContextSchema = AgentThreadContextSchema
/** @deprecated Use AgentThreadContext instead */
export type MockThreadContext = AgentThreadContext

/** @deprecated Use AgentContextSchema instead */
export const MockContextSchema = AgentContextSchema
/** @deprecated Use AgentContext instead */
export type MockContext = AgentContext

/**
 * Sandbox configuration in agent YAML
 */
export const SandboxConfigSchema = z.object({
  enabled: z.boolean().optional(),
  /** @deprecated Use 'context' instead of 'mockContext' */
  mockContext: AgentContextSchema.optional(),
  context: AgentContextSchema.optional(),
})

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>
