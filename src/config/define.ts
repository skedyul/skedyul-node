/**
 * Define helper functions for modular config files.
 *
 * These helpers provide type safety when defining resources in separate files.
 * They are identity functions that simply return their input with proper typing.
 *
 * @example
 * // models/compliance-record.ts
 * import { defineModel } from 'skedyul'
 *
 * export default defineModel({
 *   handle: 'compliance_record',
 *   label: 'Compliance Record',
 *   scope: 'internal',
 *   fields: [...]
 * })
 */

import type { ModelDefinition } from './types/model'
import type { ChannelDefinition } from './types/channel'
import type { PageDefinition } from './types/page'
import type { WorkflowDefinition } from './types/workflow'
import type { AgentDefinition } from './types/agent'
import type { EnvSchema } from './types/env'
import type { NavigationConfig } from './types/navigation'

/**
 * Define a model with full type safety.
 *
 * @example
 * export default defineModel({
 *   handle: 'compliance_record',
 *   label: 'Compliance Record',
 *   labelPlural: 'Compliance Records',
 *   scope: 'internal',
 *   fields: [
 *     { handle: 'status', label: 'Status', type: 'string', owner: 'app' }
 *   ]
 * })
 */
export function defineModel(model: ModelDefinition): ModelDefinition {
  return model
}

/**
 * Define a channel with full type safety.
 *
 * @example
 * export default defineChannel({
 *   handle: 'sms',
 *   label: 'SMS',
 *   icon: 'message-square',
 *   fields: [...],
 *   capabilities: {
 *     messaging: { label: 'SMS Messages', send: 'send_sms' }
 *   }
 * })
 */
export function defineChannel(channel: ChannelDefinition): ChannelDefinition {
  return channel
}

/**
 * Define a page with full type safety.
 *
 * @example
 * export default definePage({
 *   handle: 'phone-numbers',
 *   label: 'Phone Numbers',
 *   type: 'list',
 *   path: '/phone-numbers',
 *   blocks: [...]
 * })
 */
export function definePage(page: PageDefinition): PageDefinition {
  return page
}

/**
 * Define a workflow with full type safety.
 *
 * @example
 * export default defineWorkflow({
 *   handle: 'provision_number',
 *   label: 'Provision Number',
 *   path: './workflows/provision-number.yaml',
 *   actions: [...]
 * })
 */
export function defineWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  return workflow
}

/**
 * Define an agent with full type safety.
 *
 * @example
 * export default defineAgent({
 *   handle: 'support_agent',
 *   label: 'Support Agent',
 *   description: 'Handles customer support inquiries',
 *   system: 'You are a helpful support agent...',
 *   tools: ['search_knowledge_base', 'create_ticket']
 * })
 */
export function defineAgent(agent: AgentDefinition): AgentDefinition {
  return agent
}

/**
 * Define environment variables with full type safety.
 *
 * @example
 * export default defineEnv({
 *   TWILIO_ACCOUNT_SID: {
 *     label: 'Twilio Account SID',
 *     scope: 'provision',
 *     required: true,
 *     visibility: 'encrypted'
 *   },
 *   BUSINESS_PHONE: {
 *     label: 'Business Phone',
 *     scope: 'install',
 *     required: true
 *   }
 * })
 */
export function defineEnv(env: EnvSchema): EnvSchema {
  return env
}

/**
 * Define navigation configuration with full type safety.
 *
 * @example
 * export default defineNavigation({
 *   sidebar: {
 *     sections: [
 *       {
 *         title: 'Main',
 *         items: [
 *           { label: 'Dashboard', href: '/', icon: 'home' }
 *         ]
 *       }
 *     ]
 *   }
 * })
 */
export function defineNavigation(navigation: NavigationConfig): NavigationConfig {
  return navigation
}
