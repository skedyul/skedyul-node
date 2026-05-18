import type { TriggerContext, InputMapping, WorkflowInputSchema } from './types'
import { TriggerResolutionError } from './types'

/**
 * Simple Liquid-like template evaluation
 * Supports basic property access: {{ thread.sender.crm.email }}
 *
 * For production, consider using a proper Liquid library like liquidjs
 */
export function evaluateTemplate(template: string, context: TriggerContext): unknown {
  // Match {{ path.to.value }} patterns
  const templateRegex = /\{\{\s*([^}]+)\s*\}\}/g

  // If the entire string is a single template, return the resolved value directly
  const singleMatch = template.match(/^\{\{\s*([^}]+)\s*\}\}$/)
  if (singleMatch) {
    const path = singleMatch[1].trim()
    return resolvePath(context, path)
  }

  // Otherwise, replace all templates with string values
  return template.replace(templateRegex, (_, path) => {
    const value = resolvePath(context, path.trim())
    return value === undefined || value === null ? '' : String(value)
  })
}

/**
 * Resolve a dot-notation path against an object
 * e.g., "thread.sender.crm.email" -> context.thread.sender.crm.email
 */
function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (typeof current !== 'object') {
      return undefined
    }

    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Evaluate a condition expression against context
 * Supports basic comparisons: {{ event.participant.kind == 'CONTACT' }}
 *
 * For production, consider using a proper expression evaluator
 */
export function evaluateCondition(condition: string, context: TriggerContext): boolean {
  // Extract the expression from {{ }}
  const match = condition.match(/^\{\{\s*(.+)\s*\}\}$/)
  if (!match) {
    // If not a template, treat as truthy string
    return Boolean(condition)
  }

  const expression = match[1].trim()

  // Handle simple equality: path == 'value' or path == "value"
  const eqMatch = expression.match(/^(.+?)\s*==\s*['"](.+)['"]$/)
  if (eqMatch) {
    const [, path, expectedValue] = eqMatch
    const actualValue = resolvePath(context, path.trim())
    return actualValue === expectedValue
  }

  // Handle inequality: path != 'value'
  const neqMatch = expression.match(/^(.+?)\s*!=\s*['"](.+)['"]$/)
  if (neqMatch) {
    const [, path, expectedValue] = neqMatch
    const actualValue = resolvePath(context, path.trim())
    return actualValue !== expectedValue
  }

  // Handle boolean path: just check if truthy
  const value = resolvePath(context, expression)
  return Boolean(value)
}

/**
 * Resolve input mappings against trigger context
 */
export async function resolveInputMappings(
  mappings: InputMapping,
  inputSchema: WorkflowInputSchema | undefined,
  context: TriggerContext,
): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {}

  for (const inputName of Object.keys(mappings)) {
    const mapping = mappings[inputName]
    // Evaluate the Liquid template
    const value = evaluateTemplate(mapping, context)

    // Validate against schema if provided
    if (inputSchema) {
      const schema = inputSchema[inputName]
      if (schema?.required && (value === undefined || value === null)) {
        throw new TriggerResolutionError(`Required input "${inputName}" resolved to empty value`, undefined, inputName)
      }
    }

    resolved[inputName] = value
  }

  return resolved
}

/**
 * Check if a trigger matches an event based on subscriptions and conditions
 */
export function matchesTrigger(
  trigger: {
    workflow?: {
      events?: {
        subscribes?: string[]
        condition?: string
      }
    }
    eventConditions?: Record<string, string>
  },
  eventType: string,
  context: TriggerContext,
): boolean {
  // Check if workflow subscribes to this event type
  const subscribes = trigger.workflow?.events?.subscribes
  if (subscribes && !subscribes.includes(eventType)) {
    return false
  }

  // Check workflow-level condition
  const workflowCondition = trigger.workflow?.events?.condition
  if (workflowCondition && !evaluateCondition(workflowCondition, context)) {
    return false
  }

  // Check trigger-level condition for this event type
  const triggerCondition = trigger.eventConditions?.[eventType]
  if (triggerCondition && !evaluateCondition(triggerCondition, context)) {
    return false
  }

  return true
}
