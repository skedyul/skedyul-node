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
 * Sender context - who sent the message
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

/**
 * Full agent context - what the agent sees
 */
export const AgentContextSchema = z.object({
  // Who sent the message
  sender: SenderContextSchema,

  // Thread contexts (linked CRM instances)
  contexts: z.array(ThreadContextItemSchema).optional(),

  // Thread info
  thread: ThreadInfoSchema,

  // Workplace info
  workplace: z
    .object({
      id: z.string(),
      name: z.string().optional(),
    })
    .optional(),
})

export type AgentContext = z.infer<typeof AgentContextSchema>

/**
 * Mock context for sandbox testing
 */

/**
 * Mock subscription - channel identifier for the contact
 */
export const MockSubscriptionSchema = z.object({
  identifierValue: z.string(),
  channelHandle: z.string().optional(),
})

export type MockSubscription = z.infer<typeof MockSubscriptionSchema>

/**
 * Mock association - CRM instance linked to a contact
 */
export const MockAssociationSchema = z.object({
  id: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
})

export type MockAssociation = z.infer<typeof MockAssociationSchema>

/**
 * Mock contact - mirrors production contact structure
 */
export const MockContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  subscription: MockSubscriptionSchema.optional(),
  associations: z.record(z.string(), MockAssociationSchema).optional(),
})

export type MockContact = z.infer<typeof MockContactSchema>

export const MockSenderContextSchema = z.object({
  kind: z.enum(['contact', 'member']),
  displayName: z.string().optional(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  contact: MockContactSchema.optional(),
})

export type MockSenderContext = z.infer<typeof MockSenderContextSchema>

export const MockThreadContextSchema = z.object({
  handle: z.string(),
  model: z.string(),
  data: z.record(z.string(), z.unknown()),
})

export type MockThreadContext = z.infer<typeof MockThreadContextSchema>

export const MockContextSchema = z.object({
  sender: MockSenderContextSchema,
  contexts: z.array(MockThreadContextSchema).optional(),
})

export type MockContext = z.infer<typeof MockContextSchema>

/**
 * Sandbox configuration in agent YAML
 */
export const SandboxConfigSchema = z.object({
  enabled: z.boolean().optional(),
  mockContext: MockContextSchema.optional(),
})

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>
