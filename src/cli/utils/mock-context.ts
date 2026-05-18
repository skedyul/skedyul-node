import * as fs from 'fs'
import * as path from 'path'
import { MockContextSchema, type MockContext } from '../../context/types'

/**
 * Load mock context from a JSON file
 */
export function loadMockContext(filePath: string): MockContext {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Mock context file not found: ${absolutePath}`)
  }

  const content = fs.readFileSync(absolutePath, 'utf-8')
  let rawContext: unknown

  try {
    rawContext = JSON.parse(content)
  } catch (error) {
    throw new Error(`Failed to parse mock context JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const result = MockContextSchema.safeParse(rawContext)
  if (!result.success) {
    const errorMessages = result.error.issues
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n')
    throw new Error(`Invalid mock context:\n${errorMessages}`)
  }

  return result.data
}

/**
 * Parse a quick mock sender string
 * Format: "Display Name:kind" or "Display Name:kind:model"
 * Examples:
 *   "John Smith:contact"
 *   "John Smith:contact:customer"
 *   "Sarah Jones:member"
 */
export function parseMockSender(input: string): MockContext['sender'] {
  const parts = input.split(':')
  
  if (parts.length < 2) {
    throw new Error(
      'Invalid mock sender format. Expected "Display Name:kind" or "Display Name:kind:model"\n' +
      'Examples:\n' +
      '  --mock-sender "John Smith:contact"\n' +
      '  --mock-sender "John Smith:contact:customer"\n' +
      '  --mock-sender "Sarah Jones:member"'
    )
  }

  const displayName = parts[0].trim()
  const kind = parts[1].trim().toLowerCase()
  const model = parts[2]?.trim()

  if (!displayName) {
    throw new Error('Mock sender display name cannot be empty')
  }

  if (kind !== 'contact' && kind !== 'member') {
    throw new Error(`Invalid sender kind: "${kind}". Must be "contact" or "member"`)
  }

  const sender: MockContext['sender'] = {
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

/**
 * Build a complete mock context from sender and optional contexts
 */
export function buildMockContext(
  sender: MockContext['sender'],
  contexts?: MockContext['contexts'],
): MockContext {
  return {
    sender,
    contexts,
  }
}

/**
 * Merge mock context with defaults
 */
export function mergeMockContext(
  base: Partial<MockContext>,
  overrides: Partial<MockContext>,
): MockContext {
  return {
    sender: overrides.sender ?? base.sender ?? {
      displayName: 'Test User',
      kind: 'contact',
    },
    contexts: overrides.contexts ?? base.contexts,
  }
}
