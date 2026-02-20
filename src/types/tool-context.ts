import type { AppInfo, WorkplaceInfo, RequestInfo } from './shared'
import type { InvocationContext } from './invocation'

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Context
// ─────────────────────────────────────────────────────────────────────────────

/** Trigger types for tool execution */
export type ToolTrigger = 'provision' | 'field_change' | 'page_action' | 'form_submit' | 'agent' | 'workflow' | 'page_context'

/** Base context shared by all tool executions */
interface BaseToolContext {
  /** Environment variables */
  env: Record<string, string | undefined>
  /** Execution mode - 'estimate' returns billing info without side effects */
  mode: 'execute' | 'estimate'
  /** App info - always present */
  app: AppInfo
  /** Invocation context for log traceability */
  invocation?: InvocationContext
}

/** Provision context - no installation, no workplace */
export interface ProvisionToolContext extends BaseToolContext {
  trigger: 'provision'
}

/** Runtime base - has installation, workplace, request */
interface RuntimeToolContext extends BaseToolContext {
  appInstallationId: string
  workplace: WorkplaceInfo
  request: RequestInfo
}

/** Field change context */
export interface FieldChangeToolContext extends RuntimeToolContext {
  trigger: 'field_change'
  field: {
    handle: string
    type: string
    pageHandle: string
    value: unknown
    previousValue?: unknown
  }
}

/** Page action context */
export interface PageActionToolContext extends RuntimeToolContext {
  trigger: 'page_action'
  page: {
    handle: string
    values: Record<string, unknown>
  }
}

/** Form submit context */
export interface FormSubmitToolContext extends RuntimeToolContext {
  trigger: 'form_submit'
  form: {
    handle: string
    values: Record<string, unknown>
  }
}

/** Agent-triggered context */
export interface AgentToolContext extends RuntimeToolContext {
  trigger: 'agent'
}

/** Workflow-triggered context */
export interface WorkflowToolContext extends RuntimeToolContext {
  trigger: 'workflow'
}

/** Discriminated union of all tool execution contexts */
export type ToolExecutionContext =
  | ProvisionToolContext
  | FieldChangeToolContext
  | PageActionToolContext
  | FormSubmitToolContext
  | AgentToolContext
  | WorkflowToolContext

/** Type guard for provision context */
export function isProvisionContext(ctx: ToolExecutionContext): ctx is ProvisionToolContext {
  return ctx.trigger === 'provision'
}

/** Type guard for runtime context (any non-provision trigger) */
export function isRuntimeContext(
  ctx: ToolExecutionContext,
): ctx is FieldChangeToolContext | PageActionToolContext | FormSubmitToolContext | AgentToolContext | WorkflowToolContext {
  return ctx.trigger !== 'provision'
}
