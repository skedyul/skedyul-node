import { z } from 'zod/v4'

// ─────────────────────────────────────────────────────────────────────────────
// Agent Schema - Serializable format for agent definitions
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the canonical format used across CLI, MCP, and admin console.
// Supports both single-stage agents (with system/tools) and multi-stage agents
// (with stages for orchestration).
//
// Format: YAML (.agent.yml) or JSON (.agent.json)
// Storage: S3 with versioning for A/B testing
//
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Mode - Controls approval requirements for tool calls
// ─────────────────────────────────────────────────────────────────────────────

/** Execution mode for tool calls - determines approval requirements */
export type ToolExecutionMode = 'ALLOW_ALL' | 'REQUIRE_APPROVAL'

/** Default timeout for tool call approval (1 day in milliseconds) */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 86400000

// ─────────────────────────────────────────────────────────────────────────────
// Tool Binding Types - Discriminated union format for API
// ─────────────────────────────────────────────────────────────────────────────

export type SystemToolBinding = {
  kind: 'SYSTEM'
  name: string
  handle?: string
  displayName?: string
  description?: string
  /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
  executionMode?: ToolExecutionMode
  /** Approval timeout in ms (default: 86400000 = 1 day) */
  approvalTimeoutMs?: number
}

export type AgentToolBinding = {
  kind: 'AGENT'
  name: string
  handle?: string
  displayName?: string
  description?: string
  /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
  executionMode?: ToolExecutionMode
  /** Approval timeout in ms (default: 86400000 = 1 day) */
  approvalTimeoutMs?: number
}

export type McpToolBinding = {
  kind: 'MCP'
  server: string
  tool: string
  handle?: string
  displayName?: string
  description?: string
  /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
  executionMode?: ToolExecutionMode
  /** Approval timeout in ms (default: 86400000 = 1 day) */
  approvalTimeoutMs?: number
}

export type ToolBinding = SystemToolBinding | AgentToolBinding | McpToolBinding

// ─────────────────────────────────────────────────────────────────────────────
// Tool Reference Input - Flexible format accepted in .agent.json files
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolReferenceInput {
  tool: string
  handle?: string
  name?: string
  description?: string
  /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
  executionMode?: ToolExecutionMode
  /** Approval timeout in ms (default: 86400000 = 1 day) */
  approvalTimeoutMs?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Reference Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a tool reference string into its components.
 *
 * Supported formats:
 * - New colon-separated format:
 *   - `system:crm:model:operation` → SYSTEM tool (e.g., system:crm:prospect:get)
 *   - `system:crm:model:operation:field` → SYSTEM tool (e.g., system:crm:prospect:update:stage)
 *   - `system:settings:key` → SYSTEM tool (e.g., system:settings:business_information)
 *   - `system:thread:operation` → SYSTEM tool (e.g., system:thread:create)
 *   - `system:threads:resource:operation` → SYSTEM tool (e.g., system:threads:message:create)
 *   - `agent:handle` → AGENT tool (e.g., agent:sales-assistant)
 *   - `app:server:tool` → MCP tool (e.g., app:hubspot:create_contact)
 * - Legacy @-prefixed format:
 *   - `@crm/model/operation` → SYSTEM tool with name "model_operation"
 *   - `@agent/agent-handle` → AGENT tool with name "agent-handle"
 *   - `@app/server/tool` → MCP tool with server and tool name
 * - Plain string (legacy) → SYSTEM tool with name as-is
 *
 * @example
 * parseToolReferenceString("system:crm:prospect:get")
 * // → { kind: "SYSTEM", name: "system:crm:prospect:get" }
 *
 * parseToolReferenceString("system:threads:message:create")
 * // → { kind: "SYSTEM", name: "system:threads:message:create" }
 *
 * parseToolReferenceString("agent:sales-assistant")
 * // → { kind: "AGENT", name: "agent:sales-assistant" }
 *
 * parseToolReferenceString("app:hubspot:create_contact")
 * // → { kind: "MCP", server: "hubspot", tool: "create_contact" }
 */
export function parseToolReferenceString(
  ref: string,
): { kind: 'SYSTEM'; name: string } | { kind: 'AGENT'; name: string } | { kind: 'MCP'; server: string; tool: string } {
  // Handle new colon-separated format
  if (ref.startsWith('system:')) {
    // system:crm:*, system:settings:*, system:thread:* → SYSTEM tool
    return { kind: 'SYSTEM', name: ref }
  }

  if (ref.startsWith('agent:')) {
    // agent:handle → AGENT tool
    return { kind: 'AGENT', name: ref }
  }

  if (ref.startsWith('app:')) {
    // app:server:tool → MCP tool
    const parts = ref.split(':')
    if (parts.length < 3) {
      throw new Error(`Invalid app tool reference: "${ref}". Expected format: app:server:tool`)
    }
    const server = parts[1]
    const tool = parts.slice(2).join(':')
    return { kind: 'MCP', server, tool }
  }

  // Handle @-prefixed references (legacy format)
  if (ref.startsWith('@')) {
    const withoutAt = ref.slice(1)
    const parts = withoutAt.split('/')

    if (parts.length < 2) {
      throw new Error(`Invalid tool reference: "${ref}". Expected format: @type/name or @type/model/operation`)
    }

    const type = parts[0]

    switch (type) {
      case 'crm': {
        // @crm/model/operation → SYSTEM tool
        // e.g., @crm/prospect/prospect_get → prospect_get
        // e.g., @crm/prospect/prospect_update_stage → prospect_update_stage
        if (parts.length < 3) {
          throw new Error(`Invalid CRM tool reference: "${ref}". Expected format: @crm/model/operation`)
        }
        const operation = parts.slice(2).join('_')
        return { kind: 'SYSTEM', name: operation }
      }

      case 'agent': {
        // @agent/agent-handle → AGENT tool
        if (parts.length < 2) {
          throw new Error(`Invalid agent tool reference: "${ref}". Expected format: @agent/handle`)
        }
        const agentHandle = parts.slice(1).join('/')
        return { kind: 'AGENT', name: agentHandle }
      }

      case 'app': {
        // @app/server/tool → MCP tool
        if (parts.length < 3) {
          throw new Error(`Invalid app tool reference: "${ref}". Expected format: @app/server/tool`)
        }
        const server = parts[1]
        const tool = parts.slice(2).join('/')
        return { kind: 'MCP', server, tool }
      }

      default:
        throw new Error(`Unknown tool reference type: "${type}" in "${ref}". Supported types: @crm, @agent, @app`)
    }
  }

  // Legacy format: plain string is treated as SYSTEM tool name
  return { kind: 'SYSTEM', name: ref }
}

/**
 * Parse a tool reference input (string or object) into a ToolBinding.
 *
 * Accepts:
 * - String: "@crm/prospect/prospect_get" or "prospect_get"
 * - Object: { tool: "@crm/prospect/prospect_get", handle: "custom", name: "Display Name", description: "..." }
 *
 * @example
 * parseToolReference("@crm/prospect/prospect_get")
 * // → { kind: "SYSTEM", name: "prospect_get" }
 *
 * parseToolReference({ tool: "@crm/prospect/prospect_update", handle: "capture_structured", name: "Capture Data", description: "..." })
 * // → { kind: "SYSTEM", name: "prospect_update", handle: "capture_structured", displayName: "Capture Data", description: "..." }
 */
export function parseToolReference(input: string | ToolReferenceInput): ToolBinding {
  // Handle string input
  if (typeof input === 'string') {
    const parsed = parseToolReferenceString(input)
    return parsed as ToolBinding
  }

  // Handle object input with "tool" property
  if (typeof input === 'object' && input !== null && 'tool' in input) {
    const parsed = parseToolReferenceString(input.tool)

    // Apply overrides from the input object
    if (parsed.kind === 'SYSTEM') {
      return {
        ...parsed,
        handle: input.handle,
        displayName: input.name,
        description: input.description,
      }
    } else if (parsed.kind === 'AGENT') {
      return {
        ...parsed,
        handle: input.handle,
        displayName: input.name,
        description: input.description,
      }
    } else if (parsed.kind === 'MCP') {
      return {
        ...parsed,
        handle: input.handle,
        displayName: input.name,
        description: input.description,
      }
    }
  }

  throw new Error(`Invalid tool reference input: ${JSON.stringify(input)}`)
}

/**
 * Parse an array of tool references into ToolBinding array.
 * Handles mixed formats (strings and objects) in the same array.
 */
export function parseToolReferences(inputs: Array<string | ToolReferenceInput>): ToolBinding[] {
  return inputs.map((input, index) => {
    try {
      return parseToolReference(input)
    } catch (error) {
      throw new Error(`Error parsing tool at index ${index}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Schema - Zod validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for tool reference input in .agent.json files.
 * Accepts either a string or an object with tool reference and overrides.
 */
const ToolReferenceInputZ = z.union([
  z.string(),
  z.object({
    tool: z.string(),
    handle: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
    executionMode: z.enum(['ALLOW_ALL', 'REQUIRE_APPROVAL']).optional(),
    /** Approval timeout in ms (default: 86400000 = 1 day) */
    approvalTimeoutMs: z.number().optional(),
  }),
])

// ─────────────────────────────────────────────────────────────────────────────
// Tool Binding Schema - For YAML/JSON tool definitions
// ─────────────────────────────────────────────────────────────────────────────

const ToolBindingZ = z.union([
  z.object({
    kind: z.literal('SYSTEM'),
    name: z.string(),
    handle: z.string().optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
    executionMode: z.enum(['ALLOW_ALL', 'REQUIRE_APPROVAL']).optional(),
    /** Approval timeout in ms (default: 86400000 = 1 day) */
    approvalTimeoutMs: z.number().optional(),
  }),
  z.object({
    kind: z.literal('AGENT'),
    name: z.string(),
    handle: z.string().optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
    executionMode: z.enum(['ALLOW_ALL', 'REQUIRE_APPROVAL']).optional(),
    /** Approval timeout in ms (default: 86400000 = 1 day) */
    approvalTimeoutMs: z.number().optional(),
  }),
  z.object({
    kind: z.literal('MCP'),
    server: z.string(),
    tool: z.string(),
    handle: z.string().optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    /** Execution mode: ALLOW_ALL (default) or REQUIRE_APPROVAL */
    executionMode: z.enum(['ALLOW_ALL', 'REQUIRE_APPROVAL']).optional(),
    /** Approval timeout in ms (default: 86400000 = 1 day) */
    approvalTimeoutMs: z.number().optional(),
  }),
])

// ─────────────────────────────────────────────────────────────────────────────
// Stage Types - For multi-stage agents (Unified Schema v2)
// ─────────────────────────────────────────────────────────────────────────────
//
// All stages share a consistent shape:
// - id: unique identifier
// - type: 'agent' | 'tool' | 'transform' | 'output'
// - resource: agent handle or tool identifier (for agent/tool types)
// - needs: array of stage IDs that must complete first (dependency-based execution)
// - if: Liquid condition - stage skipped if false
// - prompt: Liquid template (mainly for agent type)
// - inputs: Liquid template mappings
// - outputs: Liquid template mappings
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base fields shared by all stage types
 */
const StageBaseZ = z.object({
  /** Unique identifier for the stage */
  id: z.string(),
  /** Stage IDs that must complete before this stage runs */
  needs: z.array(z.string()).optional(),
  /** Liquid condition - stage is skipped if this evaluates to false */
  if: z.string().optional(),
})

/**
 * Tool stage - runs a system tool, MCP tool, or activity
 * Replaces the old 'activity' type with a consistent shape
 */
const ToolStageZ = StageBaseZ.extend({
  type: z.literal('tool'),
  /** Tool identifier (e.g., 'system:crm:prospect:get', 'app:hubspot:create_contact') */
  resource: z.string(),
  /** Input mappings - Liquid templates */
  inputs: z.record(z.string(), z.string()).optional(),
  /** Output mappings - Liquid templates referencing {{ result.xxx }} */
  outputs: z.record(z.string(), z.string()).optional(),
})

/**
 * Inline agent definition for agent stages.
 * Contains all fields needed to configure the agent that runs in this stage.
 */
const StageAgentDefinitionZ = z.object({
  /** Unique identifier for the agent (lowercase, alphanumeric with dashes/underscores) */
  handle: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'Handle must be lowercase alphanumeric with dashes/underscores, starting with a letter'),
  /** Display name for the agent */
  name: z.string().min(1, 'Name is required'),
  /** Description of what the agent does */
  description: z.string().optional(),
  /** System prompt that defines the agent behavior and tool selection logic */
  system: z.string(),
  /** Optional persona name for response generation (e.g., "Brett") */
  personaName: z.string().optional(),
  /** Optional persona prompt for two-phase response generation (tone, style, format rules) */
  persona: z.string().optional(),
  /** LLM model ID (e.g., "openai/gpt-4o-mini"). Defaults to gpt-4o-mini */
  llmModelId: z.string().optional(),
  /** Array of tool references to bind to this agent */
  tools: z.array(z.union([ToolReferenceInputZ, ToolBindingZ])).optional(),
  /** JSON Schema for structured data output */
  outputSchema: z.record(z.string(), z.unknown()).optional(),
})

export type StageAgentDefinition = z.infer<typeof StageAgentDefinitionZ>

/**
 * Agent stage base schema (without refinement for use in discriminatedUnion)
 */
const AgentStageBaseZ = StageBaseZ.extend({
  type: z.literal('agent'),
  /** Inline agent definition (preferred - contains full agent config) */
  agent: StageAgentDefinitionZ.optional(),
  /** External agent reference by handle (legacy - for referencing DB agents) */
  resource: z.string().optional(),
  /** Prompt template - Liquid template for the user message */
  prompt: z.string().optional(),
  /** Input mappings - Liquid templates injected into agent context */
  inputs: z.record(z.string(), z.string()).optional(),
  /** Output mappings - Liquid templates referencing {{ result.xxx }} */
  outputs: z.record(z.string(), z.string()).optional(),
})

/**
 * Agent stage - runs an agent with inline definition or external reference
 * 
 * New format: Use `agent` object with full agent definition inline
 * Legacy format: Use `resource` string to reference an agent by handle
 */
const AgentStageZ = AgentStageBaseZ.refine(
  (data) => data.agent || data.resource,
  { message: "Either 'agent' (inline definition) or 'resource' (external reference) must be provided" }
)

/**
 * Transform stage - computes derived values without external calls
 */
const TransformStageZ = StageBaseZ.extend({
  type: z.literal('transform'),
  /** Output mappings - Liquid templates that compute values */
  outputs: z.record(z.string(), z.string()),
})

/**
 * Output stage - defines final output (terminal stage)
 */
const OutputStageZ = StageBaseZ.extend({
  type: z.literal('output'),
  /** Output mappings - Liquid templates for the final response */
  outputs: z.record(z.string(), z.string()),
})

/**
 * Union of all stage types (uses base schemas for discriminatedUnion compatibility)
 */
const StageZ = z.discriminatedUnion('type', [
  ToolStageZ,
  AgentStageBaseZ,
  TransformStageZ,
  OutputStageZ,
])

export type ToolStage = z.infer<typeof ToolStageZ>
export type AgentStage = z.infer<typeof AgentStageZ>
export type AgentStageBase = z.infer<typeof AgentStageBaseZ>
export type TransformStage = z.infer<typeof TransformStageZ>
export type OutputStage = z.infer<typeof OutputStageZ>
export type Stage = z.infer<typeof StageZ>

export { StageAgentDefinitionZ, AgentStageBaseZ, ToolStageZ, TransformStageZ, OutputStageZ, StageZ }

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Stage Types - For backward compatibility during migration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy activity stage - use 'tool' type instead
 * @deprecated Use ToolStageZ with type: 'tool' and resource: 'activity-name'
 */
const LegacyActivityStageZ = z.object({
  id: z.string(),
  type: z.literal('activity'),
  activity: z.string(),
  inputs: z.record(z.string(), z.string()).optional(),
  outputs: z.record(z.string(), z.string()).optional(),
})

/**
 * Legacy agent stage - use new AgentStageZ with 'resource' instead of 'agent'
 * @deprecated Use AgentStageZ with resource: 'agent-handle'
 */
const LegacyAgentStageZ = z.object({
  id: z.string(),
  type: z.literal('agent'),
  agent: z.string(),
  prompt: z.string().optional(),
  inputs: z.record(z.string(), z.string()).optional(),
  outputs: z.record(z.string(), z.string()).optional(),
})

/**
 * Legacy conditional stage - use 'if' on stages instead
 * @deprecated Use 'if' property on individual stages
 */
const LegacyConditionalStageZ = z.object({
  id: z.string(),
  type: z.literal('conditional'),
  condition: z.string(),
  then: z.string(),
  else: z.string().optional(),
})

/**
 * Legacy transform stage - use new TransformStageZ with 'outputs' instead of 'set'
 * @deprecated Use TransformStageZ with outputs: {...}
 */
const LegacyTransformStageZ = z.object({
  id: z.string(),
  type: z.literal('transform'),
  set: z.record(z.string(), z.string()),
})

/**
 * Legacy output stage - use new OutputStageZ with 'outputs' instead of 'value'
 * @deprecated Use OutputStageZ with outputs: {...}
 */
const LegacyOutputStageZ = z.object({
  id: z.string(),
  type: z.literal('output'),
  value: z.record(z.string(), z.string()),
})

/**
 * Combined schema that accepts both new and legacy formats
 * The runtime will normalize legacy formats to the new schema
 */
const StageWithLegacyZ = z.union([
  StageZ,
  LegacyActivityStageZ,
  LegacyAgentStageZ,
  LegacyConditionalStageZ,
  LegacyTransformStageZ,
  LegacyOutputStageZ,
])

export type LegacyActivityStage = z.infer<typeof LegacyActivityStageZ>
export type LegacyAgentStage = z.infer<typeof LegacyAgentStageZ>
export type LegacyConditionalStage = z.infer<typeof LegacyConditionalStageZ>
export type LegacyTransformStage = z.infer<typeof LegacyTransformStageZ>
export type LegacyOutputStage = z.infer<typeof LegacyOutputStageZ>
export type StageWithLegacy = z.infer<typeof StageWithLegacyZ>

/**
 * Inline agent definition - full agent definition embedded in a multi-stage pipeline.
 * Contains all fields needed to create/run the agent.
 */
const InlineAgentDefinitionZ = z.object({
  /** Unique identifier for the agent (lowercase, alphanumeric with dashes/underscores) */
  handle: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'Handle must be lowercase alphanumeric with dashes/underscores, starting with a letter'),
  /** Display name for the agent */
  name: z.string().min(1, 'Name is required'),
  /** Description of what the agent does */
  description: z.string(),
  /** System prompt that defines the agent behavior and tool selection logic */
  system: z.string(),
  /** Optional persona name for response generation (e.g., "Brett") */
  personaName: z.string().optional(),
  /** Optional persona prompt for two-phase response generation (tone, style, format rules) */
  persona: z.string().optional(),
  /** LLM model ID (e.g., "openai/gpt-4o-mini"). Defaults to gpt-4o-mini */
  llmModelId: z.string().optional(),
  /** Array of tool references to bind to this agent */
  tools: z.array(z.union([ToolReferenceInputZ, ToolBindingZ])).optional(),
  /** 
   * JSON Schema for structured data output. When provided, the agent returns structured
   * data in the `data` field matching this schema. When not provided, agent defaults to
   * plain text output in the `content` field.
   */
  outputSchema: z.record(z.string(), z.unknown()).optional(),
})

export type InlineAgentDefinition = z.infer<typeof InlineAgentDefinitionZ>

/**
 * Agent input option for select-type inputs.
 */
const AgentInputOptionZ = z.object({
  /** Value to store when selected */
  value: z.string(),
  /** Display label for the option */
  label: z.string(),
})

/**
 * Agent input field definition for UI collection.
 * These inputs are collected from the user before the agent runs.
 */
const AgentInputFieldZ = z.object({
  /** Unique key for this input (used in Thread.inputs) */
  key: z.string(),
  /** Display label for the input field */
  label: z.string().optional(),
  /** Help text/description for the input */
  description: z.string().optional(),
  /** Whether this input is required */
  required: z.boolean().optional(),
  /** Input type for rendering appropriate control */
  type: z.enum(['text', 'number', 'select', 'textarea']).optional(),
  /** Options for select-type inputs */
  options: z.array(AgentInputOptionZ).optional(),
  /** Placeholder text for the input */
  placeholder: z.string().optional(),
})

export type AgentInputOption = z.infer<typeof AgentInputOptionZ>
export type AgentInputField = z.infer<typeof AgentInputFieldZ>

/**
 * Base agent schema fields shared by both single and multi-stage agents.
 */
const AgentBaseZ = z.object({
  /** Schema format version for future compatibility */
  $schema: z.literal('https://skedyul.com/schemas/agent/v1').optional(),
  /** Unique identifier for the agent (lowercase, alphanumeric with dashes/underscores) */
  handle: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'Handle must be lowercase alphanumeric with dashes/underscores, starting with a letter'),
  /** Display name for the agent */
  name: z.string().min(1, 'Name is required'),
  /** Description of what the agent does */
  description: z.string(),
  /** Whether the agent is enabled (default: true) */
  isEnabled: z.boolean().optional(),
})

/**
 * Single-stage agent schema - traditional agent with system prompt and tools.
 * This is the default agent type that runs the agentic loop.
 */
const SingleStageAgentZ = AgentBaseZ.extend({
  /** System prompt that defines the agent behavior and tool selection logic */
  system: z.string(),
  /** Optional persona name for response generation (e.g., "Brett") */
  personaName: z.string().optional(),
  /** Optional persona prompt for two-phase response generation (tone, style, format rules) */
  persona: z.string().optional(),
  /** LLM model ID (e.g., "openai/gpt-4o-mini"). Defaults to gpt-4o-mini */
  llmModelId: z.string().optional(),
  /** Array of tool references to bind to this agent */
  tools: z.array(z.union([ToolReferenceInputZ, ToolBindingZ])).optional(),
  /** Input fields to collect from user before agent runs (stored in Thread.inputs) */
  inputs: z.array(AgentInputFieldZ).optional(),
})

/**
 * Multi-stage agent schema - orchestrates stages with inline agent definitions.
 * 
 * Each agent stage contains its own agent definition inline, eliminating the need
 * for a separate agents[] array. This makes the configuration more self-contained
 * and easier to version.
 * 
 * Stages are executed based on their 'needs' dependencies (DAG execution).
 * Stages with no dependencies run first, then stages whose dependencies are met
 * run in parallel waves until all stages complete.
 * 
 * Message output is handled via the `system:threads:message:create` tool,
 * which the agent can call to send messages to the thread. This decouples
 * agent reasoning from message creation, giving operators visibility into
 * the reasoning before any message is sent.
 */
const MultiStageAgentZ = AgentBaseZ.extend({
  /** @deprecated Use inline agent definitions in stages instead. Kept for backward compatibility. */
  agents: z.array(InlineAgentDefinitionZ).optional(),
  /** Stages define the execution flow - each stage runs an agent, tool, or transform */
  stages: z.array(StageWithLegacyZ).min(1, 'Multi-stage agents must have at least one stage'),
  /** Input schema for the agent (validated at runtime) */
  inputs: z.record(z.string(), z.object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    required: z.boolean().optional(),
    description: z.string().optional(),
  })).optional(),
  /** Error handling strategy */
  onError: z.enum(['fail', 'skip', 'retry']).optional(),
})

/**
 * Unified agent schema - supports both single-stage and multi-stage agents.
 * 
 * Single-stage agents have: system, tools, persona, personaName, llmModelId
 * Multi-stage agents have: stages, inputs, onError
 * 
 * The presence of `stages` determines which type of agent this is.
 */
export const AgentSchemaZ = z.union([SingleStageAgentZ, MultiStageAgentZ])

export type SingleStageAgent = z.infer<typeof SingleStageAgentZ>
export type MultiStageAgent = z.infer<typeof MultiStageAgentZ>
export type AgentSchema = z.infer<typeof AgentSchemaZ>

/**
 * Type guard to check if an agent is a multi-stage agent.
 */
export function isMultiStageAgent(agent: AgentSchema): agent is MultiStageAgent {
  return 'stages' in agent && Array.isArray(agent.stages)
}

/**
 * Type guard to check if an agent is a single-stage agent.
 */
export function isSingleStageAgent(agent: AgentSchema): agent is SingleStageAgent {
  return 'system' in agent && typeof agent.system === 'string'
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper function for defining agents with type safety
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define an agent with full type safety.
 * Use this in .agent.ts files for type checking and autocomplete.
 *
 * @example
 * ```typescript
 * import { defineAgent } from 'skedyul'
 *
 * export default defineAgent({
 *   handle: 'sales-assistant',
 *   name: 'Sales Assistant',
 *   description: 'Helps with sales inquiries and lead qualification',
 *   system: `You are a helpful sales assistant...`,
 *   personaName: 'Alex',
 *   persona: `Casual and friendly tone. Short sentences. Ask one question at a time.`,
 *   tools: ['crm_search', 'send_email'],
 * })
 * ```
 */
export function defineAgent(agent: AgentSchema): AgentSchema {
  return agent
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentSchemaValidationResult {
  success: boolean
  data?: AgentSchema
  errors?: Array<{
    path: string
    message: string
  }>
}

/**
 * Validate an agent schema and return detailed errors if invalid.
 */
export function validateAgentSchema(data: unknown): AgentSchemaValidationResult {
  const result = AgentSchemaZ.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))

  return { success: false, errors }
}

/**
 * Parse an agent schema, throwing an error if invalid.
 */
export function parseAgentSchema(data: unknown): AgentSchema {
  return AgentSchemaZ.parse(data)
}

/**
 * Safely parse an agent schema, returning null if invalid.
 */
export function safeParseAgentSchema(data: unknown): AgentSchema | null {
  const result = AgentSchemaZ.safeParse(data)
  return result.success ? result.data : null
}

// ─────────────────────────────────────────────────────────────────────────────
// YAML Support
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse agent YAML content into an AgentSchema.
 * Requires the `yaml` package to be installed.
 */
export async function parseAgentYaml(yamlContent: string): Promise<AgentSchema> {
  const { parse } = await import('yaml')
  const data = parse(yamlContent)
  return parseAgentSchema(data)
}

/**
 * Safely parse agent YAML content, returning null if invalid.
 */
export async function safeParseAgentYaml(yamlContent: string): Promise<AgentSchema | null> {
  try {
    const { parse } = await import('yaml')
    const data = parse(yamlContent)
    return safeParseAgentSchema(data)
  } catch {
    return null
  }
}

/**
 * Serialize an AgentSchema to YAML format.
 */
export async function serializeAgentToYaml(agent: AgentSchema): Promise<string> {
  const { stringify } = await import('yaml')
  return stringify(agent)
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Context Types - For multi-stage agent execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a stage execution
 */
export interface StageResult {
  /** Execution status */
  status: 'completed' | 'skipped' | 'failed'
  /** Whether the stage was skipped due to 'if' condition being false */
  skipped?: boolean
  /** Output values from the stage */
  outputs: Record<string, unknown>
  /** Execution duration in milliseconds */
  durationMs?: number
  /** Error message if status is 'failed' */
  error?: string
}

/**
 * Context passed between stages in a multi-stage agent.
 */
export interface AgentContext {
  /** Immutable inputs passed to the agent */
  input: Record<string, unknown>
  /** Stage results indexed by stage ID */
  stages: Record<string, StageResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage Normalization - Convert legacy formats to new unified schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a stage from legacy format to the new unified schema.
 * This allows gradual migration while maintaining backward compatibility.
 */
export function normalizeStage(stage: StageWithLegacy): Stage | LegacyConditionalStage {
  // Handle legacy 'activity' type → 'tool' type
  if (stage.type === 'activity' && 'activity' in stage) {
    return {
      id: stage.id,
      type: 'tool',
      resource: stage.activity,
      inputs: stage.inputs,
      outputs: stage.outputs,
    } as ToolStage
  }

  // Handle legacy 'agent' type with 'agent' property → 'resource' property
  if (stage.type === 'agent' && 'agent' in stage && !('resource' in stage)) {
    return {
      id: stage.id,
      type: 'agent',
      resource: (stage as LegacyAgentStage).agent,
      prompt: stage.prompt,
      inputs: stage.inputs,
      outputs: stage.outputs,
    } as AgentStage
  }

  // Handle legacy 'transform' type with 'set' property → 'outputs' property
  if (stage.type === 'transform' && 'set' in stage && !('outputs' in stage)) {
    return {
      id: stage.id,
      type: 'transform',
      outputs: (stage as LegacyTransformStage).set,
    } as TransformStage
  }

  // Handle legacy 'output' type with 'value' property → 'outputs' property
  if (stage.type === 'output' && 'value' in stage && !('outputs' in stage)) {
    return {
      id: stage.id,
      type: 'output',
      outputs: (stage as LegacyOutputStage).value,
    } as OutputStage
  }

  // Conditional stages are kept as-is for now (handled specially in runtime)
  if (stage.type === 'conditional') {
    return stage as LegacyConditionalStage
  }

  // Already in new format
  return stage as Stage
}

/**
 * Normalize all stages in an array, converting legacy formats to new schema.
 */
export function normalizeStages(stages: StageWithLegacy[]): (Stage | LegacyConditionalStage)[] {
  return stages.map(normalizeStage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Reference Parsing - For version-locked agent references
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed resource reference with optional version pinning.
 * 
 * Supports formats:
 * - `sales-clarifier` → latest version
 * - `sales-clarifier@latest` → explicitly latest version
 * - `sales-clarifier@v4` → pinned to version 4
 */
export interface ParsedResourceReference {
  /** The agent handle without version suffix */
  handle: string
  /** The pinned version number (undefined if using latest) */
  version?: number
  /** Whether this reference uses the latest version */
  isLatest: boolean
}

/**
 * Parse a resource reference string that may include version pinning.
 * 
 * Supported formats:
 * - `sales-clarifier` → { handle: "sales-clarifier", isLatest: true }
 * - `sales-clarifier@latest` → { handle: "sales-clarifier", isLatest: true }
 * - `sales-clarifier@v4` → { handle: "sales-clarifier", version: 4, isLatest: false }
 * 
 * @example
 * parseResourceReference("sales-clarifier")
 * // → { handle: "sales-clarifier", isLatest: true }
 * 
 * parseResourceReference("sales-clarifier@v4")
 * // → { handle: "sales-clarifier", version: 4, isLatest: false }
 * 
 * parseResourceReference("sales-clarifier@latest")
 * // → { handle: "sales-clarifier", isLatest: true }
 */
export function parseResourceReference(resource: string): ParsedResourceReference {
  // Match handle@version pattern: handle@v123 or handle@latest
  const match = resource.match(/^(.+?)@(v(\d+)|latest)$/)
  
  if (!match) {
    // No version suffix - use latest
    return { handle: resource, isLatest: true }
  }
  
  const handle = match[1]!
  const versionPart = match[2]!
  
  if (versionPart === 'latest') {
    return { handle, isLatest: true }
  }
  
  // Extract version number from v123 format
  const versionNumber = parseInt(match[3]!, 10)
  return { handle, version: versionNumber, isLatest: false }
}

/**
 * Format a resource reference with version pinning.
 * 
 * @example
 * formatResourceReference("sales-clarifier", 4)
 * // → "sales-clarifier@v4"
 * 
 * formatResourceReference("sales-clarifier")
 * // → "sales-clarifier@latest"
 */
export function formatResourceReference(handle: string, version?: number): string {
  if (version !== undefined) {
    return `${handle}@v${version}`
  }
  return `${handle}@latest`
}

/**
 * Pin all agent stage resources in a multi-stage agent config to specific versions.
 * This is used during commit to lock versions for reproducibility.
 * 
 * @param config - The agent config to update
 * @param versionMap - Map of agent handle to version number
 * @returns Updated config with pinned versions
 */
export function pinStageResourceVersions(
  config: AgentSchema,
  versionMap: Record<string, number>,
): AgentSchema {
  if (!isMultiStageAgent(config)) {
    return config
  }
  
  const updatedStages = config.stages.map((stage) => {
    // Only update agent stages with resource references
    if (stage.type !== 'agent' || !('resource' in stage) || !stage.resource) {
      return stage
    }
    
    // Parse the current resource reference
    const parsed = parseResourceReference(stage.resource)
    
    // Look up the version for this handle
    const version = versionMap[parsed.handle]
    
    if (version !== undefined) {
      // Pin to the specific version
      return {
        ...stage,
        resource: formatResourceReference(parsed.handle, version),
      }
    }
    
    return stage
  })
  
  return {
    ...config,
    stages: updatedStages,
  }
}
