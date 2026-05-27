import type { ResolvedSkill } from '../skills/types'

/**
 * Validation error from compilation
 */
export interface ValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * Validation warning from compilation
 */
export interface ValidationWarning {
  path: string
  message: string
}

/**
 * Resolved persona configuration
 */
export interface ResolvedPersona {
  name: string
  style: string
  format?: {
    maxChars?: number
    noEmojis?: boolean
    noHyphens?: boolean
    noBulletPoints?: boolean
    maxQuestionsPerMessage?: number
    noSignOffs?: boolean
  }
}

/**
 * Resolved tool configuration
 */
export interface ResolvedTool {
  id: string
  kind: 'SYSTEM' | 'AGENT' | 'MCP'
  name: string
  server?: string
  approval?: {
    required: boolean
    conditions?: string[]
  }
}

/**
 * Event configuration
 */
export interface EventConfig {
  subscribes: string[]
  emits: string[]
  waits: Array<{
    event: string
    timeout?: string
    onTimeout?: string
  }>
  cancels: string[]
  condition?: string
  cancelCondition?: string
}

/**
 * Memory configuration for IR
 */
export interface IRMemoryConfig {
  working?: {
    strategy: 'full' | 'rolling_summary' | 'sliding_window'
    maxTokens: number
    summarizeAt?: number
  }
  persistent?: {
    namespace?: string
  }
  semantic?: {
    enabled: boolean
    topK: number
    scope: 'thread' | 'instance' | 'workspace'
  }
}

/**
 * Policy configuration
 */
export interface PolicyConfig {
  response?: {
    requiresApproval: boolean
    conditions?: string[]
  }
  tools?: {
    externalRequiresApproval?: boolean
    systemRequiresApproval?: boolean
  }
  rules: string[]
}

/**
 * Runtime configuration
 */
export interface IRRuntimeConfig {
  model: string
  timeout: string
  retry?: {
    attempts?: number
    backoff?: 'linear' | 'exponential'
  }
}

/**
 * Agent Intermediate Representation (IR)
 * This is the compiled form of an agent YAML
 */
export interface AgentIR {
  version: string
  handle: string
  name: string
  description?: string

  // Resolved configuration
  persona?: ResolvedPersona
  skills: ResolvedSkill[]
  tools: ResolvedTool[]
  events: EventConfig
  memory: IRMemoryConfig
  policies: PolicyConfig
  runtime: IRRuntimeConfig

  // Validation results
  errors: ValidationError[]
  warnings: ValidationWarning[]

  // Computed metadata
  requiredPermissions: string[]
  estimatedTokens: number
}

/**
 * Workflow step in IR
 */
export interface WorkflowStepIR {
  id: string
  service: string
  cmd: string
  needs: string[]
  inputs: Record<string, unknown>
  condition?: string
  timeout?: string
  retry?: {
    attempts?: number
    backoff?: 'linear' | 'exponential'
  }
}

/**
 * Workflow Intermediate Representation (IR)
 */
export interface WorkflowIR {
  version: string
  handle: string
  name: string
  description?: string

  // Resolved configuration
  inputs: Record<
    string,
    {
      type: string
      required: boolean
      description?: string
      default?: unknown
    }
  >
  events: EventConfig
  steps: WorkflowStepIR[]
  runtime: {
    durable: boolean
    timeout?: string
    retry?: {
      attempts?: number
      backoff?: 'linear' | 'exponential'
    }
  }

  // Validation results
  errors: ValidationError[]
  warnings: ValidationWarning[]

  // Computed metadata
  stepOrder: string[]
  hasCycles: boolean
}

/**
 * Compilation result
 */
export interface CompilationResult<T> {
  success: boolean
  ir?: T
  errors: ValidationError[]
  warnings: ValidationWarning[]
}
