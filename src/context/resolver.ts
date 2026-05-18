import type { AgentContext, SenderContext, ThreadContextItem, MockContext } from './types'
import { ParticipantKind } from '../events/types'

/**
 * Build agent context from thread data
 * This is a utility for building the context object that gets passed to agents
 */
export function buildAgentContext(params: {
  thread: {
    id: string
    title?: string
    status?: string
    kind?: string
  }
  sender: {
    kind: 'CONTACT' | 'MEMBER' | 'AGENT' | 'WORKFLOW'
    displayName?: string
    email?: string
    role?: string
    permissions?: string[]
    crm?: {
      model: string
      instanceId: string
      data: Record<string, unknown>
    }
  }
  contexts?: Array<{
    handle: string
    model: string
    instanceId: string
    data?: Record<string, unknown>
  }>
  workplace?: {
    id: string
    name?: string
  }
}): AgentContext {
  return {
    sender: {
      kind: params.sender.kind,
      displayName: params.sender.displayName,
      email: params.sender.email,
      role: params.sender.role,
      permissions: params.sender.permissions,
      crm: params.sender.crm,
    },
    contexts: params.contexts,
    thread: {
      id: params.thread.id,
      title: params.thread.title,
      status: params.thread.status,
      kind: params.thread.kind,
    },
    workplace: params.workplace,
  }
}

/**
 * Build agent context from mock context (for sandbox testing)
 */
export function buildContextFromMock(
  mockContext: MockContext,
  threadId: string,
  workplaceId?: string,
): AgentContext {
  const senderKind = mockContext.sender.kind === 'contact' ? 'CONTACT' : 'MEMBER'

  // Build CRM from sender.contact.associations (new shape)
  // Find the first association to use as sender CRM
  const associations = mockContext.sender.contact?.associations
  let senderCrm: { model: string; instanceId: string; data: Record<string, unknown> } | undefined
  
  if (associations) {
    const firstModel = Object.keys(associations)[0]
    if (firstModel) {
      const association = associations[firstModel]
      senderCrm = {
        model: firstModel,
        instanceId: association.id ?? `mock_${firstModel}_instance`,
        data: association.data,
      }
    }
  }

  // Build contexts from sender.contact.associations (new shape) or legacy contexts array
  let contexts: Array<{ handle: string; model: string; instanceId: string; data?: Record<string, unknown> }> | undefined
  
  if (associations) {
    contexts = Object.entries(associations).map(([model, association]) => ({
      handle: `primary_${model}`,
      model,
      instanceId: association.id ?? `mock_${model}_instance`,
      data: association.data,
    }))
  } else if (mockContext.contexts) {
    // Legacy fallback
    contexts = mockContext.contexts.map((ctx) => ({
      handle: ctx.handle,
      model: ctx.model,
      instanceId: `mock_${ctx.model}_instance`,
      data: ctx.data,
    }))
  }

  return {
    sender: {
      kind: senderKind as 'CONTACT' | 'MEMBER',
      displayName: mockContext.sender.displayName,
      role: mockContext.sender.role,
      permissions: mockContext.sender.permissions,
      crm: senderCrm,
    },
    contexts,
    thread: {
      id: threadId,
      title: 'Sandbox Thread',
      status: 'open',
    },
    workplace: workplaceId
      ? {
          id: workplaceId,
          name: 'Sandbox Workplace',
        }
      : undefined,
  }
}

/**
 * Format context for system prompt injection
 */
export function formatContextForPrompt(context: AgentContext): string {
  const lines: string[] = ['CURRENT CONVERSATION:']

  // Sender info
  if (context.sender) {
    const senderType = context.sender.kind.toLowerCase()
    lines.push(`- You're talking to: ${context.sender.displayName || 'Unknown'} (${senderType})`)

    if (context.sender.crm?.data) {
      const crmData = context.sender.crm.data
      if (crmData.stage) lines.push(`- Their stage: ${crmData.stage}`)
      if (crmData.email) lines.push(`- Their email: ${crmData.email}`)
      if (crmData.preferredContact) lines.push(`- Preferred contact: ${crmData.preferredContact}`)
    }

    if (context.sender.role) {
      lines.push(`- Their role: ${context.sender.role}`)
    }
  }

  // Thread contexts
  if (context.contexts && context.contexts.length > 0) {
    lines.push('- Related context:')
    for (const ctx of context.contexts) {
      const summary = ctx.data ? summarizeContextData(ctx.data) : ''
      lines.push(`  - ${ctx.handle} (${ctx.model})${summary ? `: ${summary}` : ''}`)
    }
  }

  // Thread info
  if (context.thread) {
    if (context.thread.status) {
      lines.push(`- Thread status: ${context.thread.status}`)
    }
  }

  return lines.join('\n')
}

/**
 * Summarize context data for prompt (pick key fields)
 */
function summarizeContextData(data: Record<string, unknown>): string {
  const keyFields = ['name', 'title', 'status', 'stage', 'value', 'date']
  const summary: string[] = []

  for (const field of keyFields) {
    if (data[field] !== undefined && data[field] !== null) {
      summary.push(`${field}: ${data[field]}`)
    }
  }

  return summary.slice(0, 3).join(', ')
}

/**
 * Get CRM data from context by model handle
 */
export function getContextByHandle(context: AgentContext, handle: string): ThreadContextItem | undefined {
  return context.contexts?.find((ctx) => ctx.handle === handle)
}

/**
 * Get CRM data from context by model type
 */
export function getContextByModel(context: AgentContext, model: string): ThreadContextItem | undefined {
  return context.contexts?.find((ctx) => ctx.model === model)
}
