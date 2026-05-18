import { parse as parseYaml } from 'yaml'
import { AgentYAMLV3Schema } from '../schemas/agent-schema-v3'
import { WorkflowYAMLSchema } from '../workflows/types'
import type { AgentYAMLV3 } from '../schemas/agent-schema-v3'
import type { WorkflowYAML, WorkflowStep } from '../workflows/types'
import type { SkillYAML, ResolvedSkill } from '../skills/types'
import { getSkillToolNames } from '../skills/types'
import type {
  AgentIR,
  WorkflowIR,
  CompilationResult,
  ValidationError,
  ValidationWarning,
  ResolvedTool,
  EventConfig,
  IRMemoryConfig,
  PolicyConfig,
  IRRuntimeConfig,
  ResolvedPersona,
  WorkflowStepIR,
} from './types'

/**
 * Compile agent YAML to IR
 */
export async function compileAgent(
  yamlContent: string,
  options?: {
    skillResolver?: (handle: string) => Promise<SkillYAML | null>
  },
): Promise<CompilationResult<AgentIR>> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  try {
    const parsed = parseYaml(yamlContent)
    const result = AgentYAMLV3Schema.safeParse(parsed)

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          path: issue.path.join('.'),
          message: issue.message,
          severity: 'error',
        })
      }
      return { success: false, errors, warnings }
    }

    const agent = result.data

    const resolvedSkills = await resolveSkills(
      agent.skills ?? [],
      options?.skillResolver,
      errors,
      warnings,
    )

    const resolvedTools = resolveTools(agent.tools ?? [], errors, warnings)

    const events = resolveEvents(agent.events, warnings)

    const memory = resolveMemory(agent.memory)

    const policies = resolvePolicies(agent.policies)

    const runtime = resolveRuntime(agent.runtime)

    const persona = resolvePersona(agent.persona)

    const requiredPermissions = computeRequiredPermissions(resolvedTools)

    const estimatedTokens = estimateTokens(agent, resolvedSkills)

    const ir: AgentIR = {
      version: agent.version ?? '1.0.0',
      handle: agent.handle,
      name: agent.name,
      description: agent.description,
      persona,
      skills: resolvedSkills,
      tools: resolvedTools,
      events,
      memory,
      policies,
      runtime,
      errors,
      warnings,
      requiredPermissions,
      estimatedTokens,
    }

    return {
      success: errors.filter((e) => e.severity === 'error').length === 0,
      ir,
      errors,
      warnings,
    }
  } catch (error) {
    errors.push({
      path: '',
      message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'error',
    })
    return { success: false, errors, warnings }
  }
}

/**
 * Compile workflow YAML to IR
 */
export async function compileWorkflow(
  yamlContent: string,
): Promise<CompilationResult<WorkflowIR>> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  try {
    const parsed = parseYaml(yamlContent)
    const result = WorkflowYAMLSchema.safeParse(parsed)

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          path: issue.path.join('.'),
          message: issue.message,
          severity: 'error',
        })
      }
      return { success: false, errors, warnings }
    }

    const workflow = result.data

    const steps = resolveWorkflowSteps(workflow.steps, errors, warnings)

    const { stepOrder, hasCycles } = computeStepOrder(steps, errors)

    const events = resolveEvents(workflow.events, warnings)

    const inputs = resolveWorkflowInputs(workflow.inputs)

    const ir: WorkflowIR = {
      version: workflow.version ?? '1.0.0',
      handle: workflow.handle,
      name: workflow.name,
      description: workflow.description,
      inputs,
      events,
      steps,
      runtime: {
        durable: workflow.runtime?.durable ?? true,
        timeout: workflow.runtime?.timeout,
        retry: workflow.runtime?.retry,
      },
      errors,
      warnings,
      stepOrder,
      hasCycles,
    }

    return {
      success: errors.filter((e) => e.severity === 'error').length === 0,
      ir,
      errors,
      warnings,
    }
  } catch (error) {
    errors.push({
      path: '',
      message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'error',
    })
    return { success: false, errors, warnings }
  }
}

async function resolveSkills(
  skillRefs: Array<string | { skill: string; instructions?: string; enabled?: boolean }>,
  resolver: ((handle: string) => Promise<SkillYAML | null>) | undefined,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): Promise<ResolvedSkill[]> {
  const resolved: ResolvedSkill[] = []

  for (const ref of skillRefs) {
    if (typeof ref === 'string') {
      if (resolver) {
        const skill = await resolver(ref)
        if (skill) {
          resolved.push({
            handle: skill.handle,
            name: skill.name,
            instructions: skill.instructions,
            tools: getSkillToolNames(skill.tools),
            examples: skill.examples,
          })
        } else {
          warnings.push({
            path: `skills`,
            message: `Skill "${ref}" not found in registry`,
          })
        }
      } else {
        resolved.push({
          handle: ref,
          name: ref,
          instructions: '',
        })
      }
    } else {
      if (ref.enabled === false) continue

      if (ref.instructions) {
        resolved.push({
          handle: ref.skill,
          name: ref.skill,
          instructions: ref.instructions,
        })
      } else if (resolver) {
        const skill = await resolver(ref.skill)
        if (skill) {
          resolved.push({
            handle: skill.handle,
            name: skill.name,
            instructions: skill.instructions,
            tools: getSkillToolNames(skill.tools),
            examples: skill.examples,
          })
        } else {
          warnings.push({
            path: `skills`,
            message: `Skill "${ref.skill}" not found in registry`,
          })
        }
      }
    }
  }

  return resolved
}

function resolveTools(
  toolRefs: Array<string | { tool: string; approval?: { required?: boolean; requiredIf?: string[] } }>,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): ResolvedTool[] {
  const resolved: ResolvedTool[] = []

  for (const ref of toolRefs) {
    const toolStr = typeof ref === 'string' ? ref : ref.tool
    const approval = typeof ref === 'object' ? ref.approval : undefined

    const parsed = parseToolReference(toolStr)

    resolved.push({
      id: toolStr,
      kind: parsed.kind,
      name: parsed.name,
      server: parsed.kind === 'MCP' ? parsed.server : undefined,
      approval: approval
        ? {
            required: approval.required ?? false,
            conditions: approval.requiredIf,
          }
        : undefined,
    })
  }

  return resolved
}

function parseToolReference(ref: string): { kind: 'SYSTEM' | 'AGENT' | 'MCP'; name: string; server?: string } {
  if (ref.startsWith('system:')) {
    return { kind: 'SYSTEM', name: ref }
  }
  if (ref.startsWith('agent:')) {
    return { kind: 'AGENT', name: ref.slice(6) }
  }
  if (ref.startsWith('app:')) {
    const parts = ref.split(':')
    return { kind: 'MCP', name: parts.slice(2).join(':'), server: parts[1] }
  }
  return { kind: 'SYSTEM', name: ref }
}

function resolveEvents(
  events: AgentYAMLV3['events'] | WorkflowYAML['events'] | undefined,
  warnings: ValidationWarning[],
): EventConfig {
  return {
    subscribes: events?.subscribes ?? [],
    emits: (events as AgentYAMLV3['events'])?.emits ?? [],
    waits:
      (events as AgentYAMLV3['events'])?.waits?.map((w) => ({
        event: w.event,
        timeout: w.timeout,
        onTimeout: w.onTimeout,
      })) ?? [],
    cancels: events?.cancels ?? [],
    condition: events?.condition,
    cancelCondition: events?.cancelCondition,
  }
}

function resolveMemory(memory: AgentYAMLV3['memory'] | undefined): IRMemoryConfig {
  return {
    working: memory?.working
      ? {
          strategy: memory.working.strategy ?? 'rolling_summary',
          maxTokens: memory.working.maxTokens ?? 8000,
          summarizeAt: memory.working.summarizeAt,
        }
      : undefined,
    persistent: memory?.persistent,
    semantic: memory?.semantic
      ? {
          enabled: memory.semantic.enabled ?? false,
          topK: memory.semantic.topK ?? 5,
          scope: memory.semantic.scope ?? 'thread',
        }
      : undefined,
  }
}

function resolvePolicies(policies: AgentYAMLV3['policies'] | undefined): PolicyConfig {
  return {
    response: policies?.response
      ? {
          requiresApproval: policies.response.requiresApproval ?? false,
          conditions: policies.response.requiresApprovalIf,
        }
      : undefined,
    rules: policies?.rules ?? [],
  }
}

function resolveRuntime(runtime: AgentYAMLV3['runtime'] | undefined): IRRuntimeConfig {
  return {
    model: runtime?.model ?? 'anthropic/claude-sonnet-4',
    timeout: runtime?.timeout ?? '5m',
    retry: runtime?.retry,
  }
}

function resolvePersona(persona: AgentYAMLV3['persona'] | undefined): ResolvedPersona | undefined {
  if (!persona) return undefined

  return {
    name: persona.name,
    style: persona.voice.style,
    format: persona.voice.format,
  }
}

function resolveWorkflowSteps(
  steps: Record<string, WorkflowStep>,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): WorkflowStepIR[] {
  return Object.entries(steps).map(([id, step]) => ({
    id,
    service: step.service,
    cmd: step.cmd,
    needs: step.needs ?? [],
    inputs: (step.inputs as Record<string, unknown>) ?? {},
    condition: step.condition,
    timeout: step.timeout,
    retry: step.retry,
  }))
}

function resolveWorkflowInputs(
  inputs: WorkflowYAML['inputs'] | undefined,
): WorkflowIR['inputs'] {
  if (!inputs) return {}

  const resolved: WorkflowIR['inputs'] = {}
  for (const [name, def] of Object.entries(inputs)) {
    resolved[name] = {
      type: def.type,
      required: def.required ?? false,
      description: def.description,
      default: def.default,
    }
  }
  return resolved
}

function computeStepOrder(
  steps: WorkflowStepIR[],
  errors: ValidationError[],
): { stepOrder: string[]; hasCycles: boolean } {
  const stepMap = new Map(steps.map((s) => [s.id, s]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const order: string[] = []
  let hasCycles = false

  function visit(id: string): boolean {
    if (visited.has(id)) return true
    if (visiting.has(id)) {
      hasCycles = true
      errors.push({
        path: `steps.${id}`,
        message: `Circular dependency detected involving step "${id}"`,
        severity: 'error',
      })
      return false
    }

    visiting.add(id)
    const step = stepMap.get(id)
    if (step) {
      for (const dep of step.needs) {
        if (!stepMap.has(dep)) {
          errors.push({
            path: `steps.${id}.needs`,
            message: `Step "${id}" depends on unknown step "${dep}"`,
            severity: 'error',
          })
          continue
        }
        if (!visit(dep)) return false
      }
    }
    visiting.delete(id)
    visited.add(id)
    order.push(id)
    return true
  }

  for (const step of steps) {
    if (!visited.has(step.id)) {
      visit(step.id)
    }
  }

  return { stepOrder: order, hasCycles }
}

function computeRequiredPermissions(tools: ResolvedTool[]): string[] {
  const permissions = new Set<string>()

  for (const tool of tools) {
    if (tool.kind === 'SYSTEM') {
      if (tool.name.includes('crm')) {
        permissions.add('crm.read')
        if (tool.name.includes('update') || tool.name.includes('create') || tool.name.includes('delete')) {
          permissions.add('crm.write')
        }
      }
      if (tool.name.includes('thread') || tool.name.includes('message')) {
        permissions.add('threads.read')
        if (tool.name.includes('create') || tool.name.includes('send')) {
          permissions.add('threads.write')
        }
      }
    }
    if (tool.kind === 'MCP') {
      permissions.add(`mcp.${tool.server}`)
    }
  }

  return Array.from(permissions)
}

function estimateTokens(agent: AgentYAMLV3, skills: ResolvedSkill[]): number {
  let tokens = 0

  if (agent.persona) {
    tokens += Math.ceil(agent.persona.voice.style.length / 4)
  }

  for (const skill of skills) {
    if (skill.instructions) {
      tokens += Math.ceil(skill.instructions.length / 4)
    }
    if (skill.examples) {
      for (const example of skill.examples) {
        tokens += Math.ceil((example.input.length + example.output.length) / 4)
      }
    }
  }

  if (agent.policies?.rules) {
    for (const rule of agent.policies.rules) {
      tokens += Math.ceil(rule.length / 4)
    }
  }

  return tokens
}
