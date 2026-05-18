import { z } from 'zod/v4'

/**
 * Skill YAML schema versions
 */
export const SKILL_SCHEMA_VERSION = 'https://skedyul.com/schemas/skill/v1'
export const SKILL_SCHEMA_VERSION_V2 = 'https://skedyul.com/schemas/skill/v2'

/**
 * Skill source - where the skill comes from
 */
export const SkillSourceSchema = z.enum(['BUILTIN', 'S3', 'APP', 'EXTERNAL'])

export type SkillSource = z.infer<typeof SkillSourceSchema>

/**
 * Skill tool requirement (v1 - legacy)
 * @deprecated Use SkillToolDefinitionSchema for v2 skills
 */
export const SkillToolRequirementSchema = z.object({
  requires: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
})

export type SkillToolRequirement = z.infer<typeof SkillToolRequirementSchema>

/**
 * Sandbox configuration for skill tools
 */
export const SkillToolSandboxSchema = z.object({
  mock: z.unknown().optional(),
})

export type SkillToolSandbox = z.infer<typeof SkillToolSandboxSchema>

/**
 * Tool constraints configuration for execution limits and categorization.
 * Used to control how tools are executed at runtime.
 */
export const ToolConstraintsSchema = z.object({
  maxCallsPerRun: z.number().optional(),
  idempotent: z.boolean().optional(),
  restricted: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
})

export type ToolConstraints = z.infer<typeof ToolConstraintsSchema>

/**
 * Full tool definition owned by a skill (v2)
 * Skills own their tools with full configuration including descriptions,
 * overrides, sandbox mocks, approval settings, and execution constraints.
 */
export const SkillToolDefinitionSchema = z.object({
  tool: z.string(),
  description: z.string().optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  sandbox: SkillToolSandboxSchema.optional(),
  requiresApproval: z.boolean().optional(),
  constraints: ToolConstraintsSchema.optional(),
})

export type SkillToolDefinition = z.infer<typeof SkillToolDefinitionSchema>

/**
 * Tools configuration - supports both v1 (requires array) and v2 (full definitions)
 */
export const SkillToolsSchema = z.union([
  SkillToolRequirementSchema,
  z.array(SkillToolDefinitionSchema),
])

/**
 * Skill example - few-shot learning example
 */
export const SkillExampleSchema = z.object({
  context: z.string().optional(),
  input: z.string(),
  reasoning: z.string().optional(),
  output: z.string(),
  tool_call: z.string().optional(),
})

export type SkillExample = z.infer<typeof SkillExampleSchema>

/**
 * Skill evaluation metric
 */
export const SkillEvaluationMetricSchema = z.object({
  metric: z.string(),
  description: z.string().optional(),
  threshold: z.number().optional(),
})

export type SkillEvaluationMetric = z.infer<typeof SkillEvaluationMetricSchema>

/**
 * CRM context configuration - specifies which models and fields to include
 * in the CRM schema when loading this skill.
 */
export const CRMContextSchema = z.object({
  models: z.record(z.string(), z.array(z.string())), // { modelHandle: [fieldHandles] }
})

export type CRMContext = z.infer<typeof CRMContextSchema>

/**
 * Full Skill YAML schema (supports both v1 and v2)
 * 
 * v1: tools is SkillToolRequirementSchema ({ requires: [...] })
 * v2: tools is array of SkillToolDefinitionSchema (full tool ownership)
 */
export const SkillYAMLSchema = z.object({
  // Schema version
  $schema: z.string().optional(),

  // Identity
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),

  // Instructions injected into agent system prompt
  instructions: z.string(),

  // Tool configuration - supports both v1 and v2 formats
  tools: SkillToolsSchema.optional(),

  // CRM context - specifies which models/fields to include in schema
  crmContext: CRMContextSchema.optional(),

  // Few-shot examples
  examples: z.array(SkillExampleSchema).optional(),

  // Evaluation criteria
  evaluation: z.array(SkillEvaluationMetricSchema).optional(),

  // Tags for discovery
  tags: z.array(z.string()).optional(),
})

export type SkillYAML = z.infer<typeof SkillYAMLSchema>

/**
 * Skill YAML v2 schema - explicit v2 with tool ownership
 * Use this when you want to enforce v2 format with full tool definitions.
 */
export const SkillYAMLV2Schema = z.object({
  $schema: z.literal(SKILL_SCHEMA_VERSION_V2).optional(),
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string(),
  tools: z.array(SkillToolDefinitionSchema).optional(),
  crmContext: CRMContextSchema.optional(),
  examples: z.array(SkillExampleSchema).optional(),
  evaluation: z.array(SkillEvaluationMetricSchema).optional(),
  tags: z.array(z.string()).optional(),
})

export type SkillYAMLV2 = z.infer<typeof SkillYAMLV2Schema>

/**
 * Version weight for A/B testing
 */
export const SkillVersionWeightSchema = z.object({
  version: z.number(),
  weight: z.number(),
})

export type SkillVersionWeight = z.infer<typeof SkillVersionWeightSchema>

/**
 * Skill reference in agent YAML - can be a string handle or object with version config
 */
export const SkillRefSchema = z.union([
  z.string(), // Just handle - uses latest published version
  z.object({
    skill: z.string(),
    description: z.string().optional(), // For AI SDK Agent Skills discovery
    // Version selection (pick one):
    version: z.number().optional(), // Pin to specific version number
    versions: z.array(SkillVersionWeightSchema).optional(), // A/B testing weights
    // Legacy support:
    instructions: z.string().optional(), // Inline instructions (deprecated)
    enabled: z.boolean().optional(),
  }),
])

export type SkillRef = z.infer<typeof SkillRefSchema>

/**
 * Skill metadata (for registry)
 */
export const SkillMetadataSchema = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  source: SkillSourceSchema,
  s3Key: z.string().optional(),
  appVersionId: z.string().optional(),
  workplaceId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>

/**
 * Resolved skill - loaded and ready for injection.
 * Tools are represented as string names for backward compatibility with IR.
 * Use LoadedSkill for runtime skill loading with full tool definitions.
 */
export const ResolvedSkillSchema = z.object({
  handle: z.string(),
  name: z.string(),
  instructions: z.string().optional(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  examples: z.array(SkillExampleSchema).optional(),
})

export type ResolvedSkill = z.infer<typeof ResolvedSkillSchema>

/**
 * Loaded skill - skill loaded at runtime with full tool definitions.
 * Used by SkillToolRegistry for dynamic tool registration.
 */
export const LoadedSkillSchema = z.object({
  handle: z.string(),
  name: z.string(),
  instructions: z.string().optional(),
  description: z.string().optional(),
  tools: z.array(SkillToolDefinitionSchema).optional(),
  examples: z.array(SkillExampleSchema).optional(),
})

export type LoadedSkill = z.infer<typeof LoadedSkillSchema>

/**
 * Helper to check if skill tools are v2 format (array of tool definitions)
 */
export function isV2SkillTools(
  tools: SkillToolRequirement | SkillToolDefinition[] | undefined
): tools is SkillToolDefinition[] {
  if (!tools) return false
  return Array.isArray(tools)
}

/**
 * Helper to extract tool names from either v1 or v2 format
 */
export function getSkillToolNames(
  tools: SkillToolRequirement | SkillToolDefinition[] | undefined
): string[] {
  if (!tools) return []
  if (isV2SkillTools(tools)) {
    return tools.map((t) => t.tool)
  }
  return tools.requires || []
}

/**
 * Helper to convert v1 tool requirements to v2 tool definitions
 * Used during migration or when loading legacy skills
 */
export function convertV1ToV2Tools(
  requires: string[]
): SkillToolDefinition[] {
  return requires.map((tool) => ({ tool }))
}

/**
 * Skill discovery metadata - minimal info for system prompt
 * Following AI SDK Agent Skills pattern: only name + description at startup
 */
export interface SkillDiscoveryInfo {
  handle: string
  name: string
  description: string
}

/**
 * Helper function to define a skill with type safety
 */
export function defineSkill(skill: SkillYAML): SkillYAML {
  return SkillYAMLSchema.parse(skill)
}

/**
 * Validate a skill YAML object
 */
export function validateSkillYAML(skill: unknown): { success: true; data: SkillYAML } | { success: false; error: z.ZodError } {
  const result = SkillYAMLSchema.safeParse(skill)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

/**
 * Format skill instructions for injection into system prompt
 * @deprecated Use formatSkillDiscovery for AI SDK Agent Skills pattern
 */
export function formatSkillInstructions(skills: ResolvedSkill[]): string {
  if (skills.length === 0) return ''

  const sections = skills.map((skill) => {
    if (!skill.instructions) {
      // No instructions loaded - just show name and description
      return `## ${skill.name}\n\n${skill.description || 'No description available.'}`
    }
    
    let section = `## ${skill.name}\n\n${skill.instructions}`

    if (skill.examples && skill.examples.length > 0) {
      section += '\n\n### Examples\n'
      for (const example of skill.examples) {
        section += `\n**Input:** ${example.input}\n`
        if (example.reasoning) {
          section += `**Reasoning:** ${example.reasoning}\n`
        }
        section += `**Output:** ${example.output}\n`
      }
    }

    return section
  })

  return `# Skills\n\n${sections.join('\n\n---\n\n')}`
}

/**
 * Format skill discovery list for system prompt.
 * Following AI SDK Agent Skills pattern: only name + description at startup.
 * Full instructions are loaded on-demand via the loadSkill tool.
 *
 * @param skills - Array of skill discovery info objects
 * @param workflowInstructions - Optional custom workflow instructions for the agent
 */
export function formatSkillDiscovery(
  skills: SkillDiscoveryInfo[],
  workflowInstructions?: string,
): string {
  if (skills.length === 0) return ''

  const skillsList = skills
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join('\n')

  const defaultWorkflow = `WORKFLOW FOR EVERY RESPONSE:
1. Check the Current Context data to understand the current state
2. Read the skill descriptions below - each tells you WHEN to use it
3. Load the matching skill using \`system:skill:load\`
4. Follow the skill's instructions exactly`

  const workflow = workflowInstructions ?? defaultWorkflow

  return `## Skills

${workflow}

Available skills:
${skillsList}

IMPORTANT: Always use the proper tool calls. Do NOT output XML-like tags in your response.`
}
