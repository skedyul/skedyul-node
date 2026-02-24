/**
 * Agent definition types.
 *
 * Agents are AI assistants that can use tools to perform tasks.
 * They are created globally during provisioning and become available
 * to workplaces that install the app.
 */

import type { BaseDefinition } from './base'

/**
 * Agent definition.
 */
export interface AgentDefinition extends BaseDefinition {
  /** System prompt (static, no templating) */
  system: string
  /** Tool names to bind (must exist in this app's tools) */
  tools: string[]
  /** Optional LLM model override (defaults to workspace default) */
  llmModelId?: string
  /**
   * Parent agent that can call this agent.
   * Creates an AGENT-type tool and binds it to the parent.
   *
   * Values:
   * - 'composer': Bind to the workspace's Composer agent
   * - '<handle>': Bind to another agent in this app (by handle)
   * - undefined: Standalone agent (not callable by other agents)
   */
  parentAgent?: string
}
