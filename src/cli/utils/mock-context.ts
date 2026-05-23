import * as fs from 'fs'
import * as path from 'path'
import { AgentContextSchema, type AgentContext } from '../../context/types'

/**
 * Load agent context from a JSON file
 */
export function loadContext(filePath: string): AgentContext {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Context file not found: ${absolutePath}`)
  }

  const content = fs.readFileSync(absolutePath, 'utf-8')
  let rawContext: unknown

  try {
    rawContext = JSON.parse(content)
  } catch (error) {
    throw new Error(`Failed to parse context JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const result = AgentContextSchema.safeParse(rawContext)
  if (!result.success) {
    const errorMessages = result.error.issues
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n')
    throw new Error(`Invalid context:\n${errorMessages}`)
  }

  return result.data
}

/** @deprecated Use loadContext instead */
export const loadMockContext = loadContext

/** Read prospect CRM data from context (associations shape or legacy contexts). */
export function getProspectData(
  context: AgentContext | null | undefined,
): Record<string, unknown> | undefined {
  const fromAssociations =
    context?.sender?.contact?.associations?.prospect?.data
  if (fromAssociations) {
    return fromAssociations
  }
  return context?.contexts?.find((c) => c.model === 'prospect')?.data
}

/**
 * Parse a quick sender string
 * Format: "Display Name:kind" or "Display Name:kind:model"
 * Examples:
 *   "John Smith:contact"
 *   "John Smith:contact:customer"
 *   "Sarah Jones:member"
 */
export function parseSender(input: string): AgentContext['sender'] {
  const parts = input.split(':')
  
  if (parts.length < 2) {
    throw new Error(
      'Invalid sender format. Expected "Display Name:kind" or "Display Name:kind:model"\n' +
      'Examples:\n' +
      '  --sender "John Smith:contact"\n' +
      '  --sender "John Smith:contact:customer"\n' +
      '  --sender "Sarah Jones:member"'
    )
  }

  const displayName = parts[0].trim()
  const kind = parts[1].trim().toLowerCase()
  const model = parts[2]?.trim()

  if (!displayName) {
    throw new Error('Sender display name cannot be empty')
  }

  if (kind !== 'contact' && kind !== 'member') {
    throw new Error(`Invalid sender kind: "${kind}". Must be "contact" or "member"`)
  }

  const sender: AgentContext['sender'] = {
    displayName,
    kind: kind as 'contact' | 'member',
  }

  // If a model is specified, add CRM data via contact.associations
  if (model && kind === 'contact') {
    sender.contact = {
      name: displayName,
      associations: {
        [model]: {
          data: {
            name: displayName,
          },
        },
      },
    }
  }

  return sender
}

/** @deprecated Use parseSender instead */
export const parseMockSender = parseSender

/**
 * Build a complete context from sender and optional contexts
 */
export function buildContext(
  sender: AgentContext['sender'],
  contexts?: AgentContext['contexts'],
): AgentContext {
  return {
    sender,
    contexts,
  }
}

/** @deprecated Use buildContext instead */
export const buildMockContext = buildContext

/**
 * Merge context with defaults
 */
export function mergeContext(
  base: Partial<AgentContext>,
  overrides: Partial<AgentContext>,
): AgentContext {
  return {
    sender: overrides.sender ?? base.sender ?? {
      displayName: 'Test User',
      kind: 'contact',
    },
    contexts: overrides.contexts ?? base.contexts,
  }
}

/** @deprecated Use mergeContext instead */
export const mergeMockContext = mergeContext
