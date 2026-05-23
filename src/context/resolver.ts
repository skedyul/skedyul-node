import type { AgentContext, AgentThreadContext } from './types'

/**
 * Build agent context from thread participant data.
 * 
 * This creates the unified AgentContext shape used by both sandbox and production.
 */
export function buildAgentContext(params: {
  sender: {
    kind: 'contact' | 'member'
    displayName?: string
    role?: string
    permissions?: string[]
    contact?: {
      id?: string
      name?: string
      subscription?: {
        identifierValue: string
        channelHandle?: string
      }
      associations?: Record<string, { id?: string; data: Record<string, unknown> }>
    }
  }
  contexts?: Array<{
    handle: string
    model: string
    data: Record<string, unknown>
  }>
}): AgentContext {
  return {
    sender: {
      kind: params.sender.kind,
      displayName: params.sender.displayName,
      role: params.sender.role,
      permissions: params.sender.permissions,
      contact: params.sender.contact,
    },
    contexts: params.contexts,
  }
}

/**
 * Format context for system prompt injection.
 * 
 * This creates the "Current Context" section that gets injected into the system prompt.
 */
export function formatContextForPrompt(context: AgentContext): string {
  const lines: string[] = ['CURRENT CONTEXT:']

  // Sender info
  if (context.sender) {
    const senderType = context.sender.kind
    lines.push(`- You're talking to: ${context.sender.displayName || 'Unknown'} (${senderType})`)

    // Contact associations (CRM data)
    const associations = context.sender.contact?.associations
    if (associations) {
      for (const [model, association] of Object.entries(associations)) {
        const data = association.data
        if (data.stage) lines.push(`- Their ${model} stage: ${data.stage}`)
        if (data.email) lines.push(`- Their email: ${data.email}`)
        if (data.preferredContact) lines.push(`- Preferred contact: ${data.preferredContact}`)
      }
    }

    if (context.sender.role) {
      lines.push(`- Their role: ${context.sender.role}`)
    }

    // Subscription info
    const subscription = context.sender.contact?.subscription
    if (subscription) {
      lines.push(`- Channel: ${subscription.channelHandle ?? 'unknown'} (${subscription.identifierValue})`)
    }
  }

  // Additional contexts
  if (context.contexts && context.contexts.length > 0) {
    lines.push('- Related context:')
    for (const ctx of context.contexts) {
      const summary = ctx.data ? summarizeContextData(ctx.data) : ''
      lines.push(`  - ${ctx.handle} (${ctx.model})${summary ? `: ${summary}` : ''}`)
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
export function getContextByHandle(context: AgentContext, handle: string): AgentThreadContext | undefined {
  return context.contexts?.find((ctx) => ctx.handle === handle)
}

/**
 * Get CRM data from context by model type
 */
export function getContextByModel(context: AgentContext, model: string): AgentThreadContext | undefined {
  return context.contexts?.find((ctx) => ctx.model === model)
}

/**
 * Get an association from the sender's contact by model handle
 */
export function getAssociationByModel(
  context: AgentContext,
  model: string,
): { id?: string; data: Record<string, unknown> } | undefined {
  return context.sender.contact?.associations?.[model]
}
