import { z } from 'zod/v4'
import { EventsConfigSchema } from '../events/types'
import { SkillRefSchema } from '../skills/types'
import { SandboxConfigSchema } from '../context/types'

/**
 * Agent YAML v3 Schema
 *
 * This is the new agent schema that removes stages and uses skills instead.
 * Agents are now first-class thread participants that subscribe to events
 * and react autonomously using skills and tools.
 */

export const AGENT_SCHEMA_VERSION_V3 = 'https://skedyul.com/schemas/agent/v3'

/**
 * Persona voice format configuration
 */
export const PersonaVoiceFormatV3Schema = z.object({
  maxChars: z.number().optional(),
  noEmojis: z.boolean().optional(),
  noHyphens: z.boolean().optional(),
  noBulletPoints: z.boolean().optional(),
  maxQuestionsPerMessage: z.number().optional(),
  noSignOffs: z.boolean().optional(),
})

export type PersonaVoiceFormatV3 = z.infer<typeof PersonaVoiceFormatV3Schema>

/**
 * Persona voice configuration
 */
export const PersonaVoiceV3Schema = z.object({
  style: z.string(),
  format: PersonaVoiceFormatV3Schema.optional(),
})

export type PersonaVoiceV3 = z.infer<typeof PersonaVoiceV3Schema>

/**
 * Persona configuration for agent voice and formatting
 */
export const PersonaV3Schema = z.object({
  name: z.string(),
  voice: PersonaVoiceV3Schema,
})

export type PersonaV3 = z.infer<typeof PersonaV3Schema>

/**
 * Tool approval configuration
 */
export const ToolApprovalConfigSchema = z.object({
  required: z.boolean().optional(),
  requiredIf: z.array(z.string()).optional(),
})

export type ToolApprovalConfig = z.infer<typeof ToolApprovalConfigSchema>

/**
 * Tool sandbox configuration for mock responses
 */
export const ToolSandboxConfigSchema = z.object({
  mock: z.unknown().optional(),
})

export type ToolSandboxConfig = z.infer<typeof ToolSandboxConfigSchema>

/**
 * Tool reference with optional approval and sandbox configuration
 * @deprecated Root-level tools on agents are deprecated. Use skills to own tools.
 * For always-available system tools, use bootstrapTools instead.
 */
export const ToolRefV3Schema = z.union([
  z.string(),
  z.object({
    tool: z.string(),
    description: z.string().optional(),
    approval: ToolApprovalConfigSchema.optional(),
    sandbox: ToolSandboxConfigSchema.optional(),
    overrides: z.record(z.string(), z.unknown()).optional(),
  }),
])

export type ToolRefV3 = z.infer<typeof ToolRefV3Schema>

/**
 * Bootstrap tool reference - minimal config for always-available system tools
 * These tools are available before any skill is loaded (e.g., system:skill:load)
 */
export const BootstrapToolRefSchema = z.union([
  z.string(),
  z.object({
    tool: z.string(),
    description: z.string().optional(),
  }),
])

export type BootstrapToolRef = z.infer<typeof BootstrapToolRefSchema>

/**
 * Memory configuration for working memory
 */
export const WorkingMemoryConfigSchema = z.object({
  strategy: z.enum(['full', 'rolling_summary', 'sliding_window']).optional(),
  maxTokens: z.number().optional(),
  summarizeAt: z.number().optional(),
})

export type WorkingMemoryConfig = z.infer<typeof WorkingMemoryConfigSchema>

/**
 * Memory configuration for external data
 */
export const ExternalMemoryConfigSchema = z.object({
  enabled: z.boolean().optional(),
  ttl: z.string().optional(),
})

export type ExternalMemoryConfig = z.infer<typeof ExternalMemoryConfigSchema>

/**
 * Memory configuration for semantic search
 */
export const SemanticMemoryConfigSchema = z.object({
  enabled: z.boolean().optional(),
  topK: z.number().optional(),
  scope: z.enum(['thread', 'instance', 'workspace']).optional(),
})

export type SemanticMemoryConfig = z.infer<typeof SemanticMemoryConfigSchema>

/**
 * Full memory configuration
 */
export const MemoryConfigV3Schema = z.object({
  working: WorkingMemoryConfigSchema.optional(),
  persistent: z
    .object({
      namespace: z.string().optional(),
    })
    .optional(),
  external: ExternalMemoryConfigSchema.optional(),
  semantic: SemanticMemoryConfigSchema.optional(),
})

export type MemoryConfigV3 = z.infer<typeof MemoryConfigV3Schema>

/**
 * Policy configuration for response approval
 */
export const ResponsePolicySchema = z.object({
  requiresApproval: z.boolean().optional(),
  requiresApprovalIf: z.array(z.string()).optional(),
})

export type ResponsePolicy = z.infer<typeof ResponsePolicySchema>

/**
 * Full policies configuration
 */
export const PoliciesConfigV3Schema = z.object({
  response: ResponsePolicySchema.optional(),
  rules: z.array(z.string()).optional(),
})

export type PoliciesConfigV3 = z.infer<typeof PoliciesConfigV3Schema>

/**
 * Runtime configuration
 */
export const RuntimeConfigV3Schema = z.object({
  model: z.string().optional(),
  timeout: z.string().optional(),
  timezone: z.string().optional(),
  retry: z
    .object({
      attempts: z.number().optional(),
      backoff: z.enum(['linear', 'exponential']).optional(),
    })
    .optional(),
})

export type RuntimeConfigV3 = z.infer<typeof RuntimeConfigV3Schema>

/**
 * Prompts configuration for agent-specific prompt injections.
 * These prompts are injected during specific runtime phases.
 */
export const PromptsConfigV3Schema = z.object({
  recovery: z.string().optional(),
  followUp: z.string().optional(),
  skillDiscoveryWorkflow: z.string().optional(),
})

export type PromptsConfigV3 = z.infer<typeof PromptsConfigV3Schema>

/**
 * Agent configuration (business-specific settings)
 */
export const AgentConfigV3Schema = z.record(z.string(), z.unknown())

export type AgentConfigV3 = z.infer<typeof AgentConfigV3Schema>

/**
 * Full Agent YAML v3 Schema
 *
 * This schema removes stages and uses skills instead.
 * Agents subscribe to events and react autonomously.
 * 
 * Tool Ownership Model:
 * - Skills own their tools (defined in skill files with full config)
 * - Agents reference skills, not individual tools
 * - bootstrapTools: Always-available system tools (e.g., system:skill:load)
 * - tools: DEPRECATED - kept for backward compatibility only
 */
export const AgentYAMLV3Schema = z.object({
  $schema: z.string().optional(),
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),

  // Persona - Who the agent is
  persona: PersonaV3Schema.optional(),

  // Skills - What the agent knows how to do (skills own their tools)
  skills: z.array(SkillRefSchema).optional(),

  // Bootstrap tools - Always-available system tools before any skill loads
  // Examples: system:skill:load, system:message:send
  bootstrapTools: z.array(BootstrapToolRefSchema).optional(),

  // Tools - DEPRECATED: Use skills to own tools instead
  // Kept for backward compatibility during migration
  // @deprecated Will be removed in a future version
  tools: z.array(ToolRefV3Schema).optional(),

  // Events - When the agent activates
  events: EventsConfigSchema.optional(),

  // Memory - How the agent remembers
  memory: MemoryConfigV3Schema.optional(),

  // Policies - Constraints and approvals
  policies: PoliciesConfigV3Schema.optional(),

  // Runtime - Execution configuration
  runtime: RuntimeConfigV3Schema.optional(),

  // Prompts - Agent-specific prompt injections for runtime phases
  // recovery: Injected during second pass when skills were loaded but tools not used
  // followUp: Injected during follow-up passes when context needs updating
  // skillDiscoveryWorkflow: Custom workflow instructions for skill discovery
  prompts: PromptsConfigV3Schema.optional(),

  // Config - Business-specific settings
  config: AgentConfigV3Schema.optional(),

  // Sandbox - Testing configuration
  sandbox: SandboxConfigSchema.optional(),
})

export type AgentYAMLV3 = z.infer<typeof AgentYAMLV3Schema>

/**
 * Helper function to define an agent with type safety
 */
export function defineAgentV3(agent: AgentYAMLV3): AgentYAMLV3 {
  return AgentYAMLV3Schema.parse(agent)
}

/**
 * Validate an agent YAML v3 object
 */
export function validateAgentYAMLV3(
  agent: unknown,
): { success: true; data: AgentYAMLV3 } | { success: false; error: z.ZodError } {
  const result = AgentYAMLV3Schema.safeParse(agent)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}
