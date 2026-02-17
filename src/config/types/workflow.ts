import type { ResourceDependency } from './resource'

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowActionInput {
  key: string
  label: string
  fieldRef?: { fieldHandle: string; entityHandle: string }
  template?: string
}

export interface WorkflowAction {
  label: string
  handle: string
  batch?: boolean
  entityHandle?: string
  inputs?: WorkflowActionInput[]
}

export interface WorkflowDefinition {
  path: string
  label?: string
  handle?: string
  requires?: ResourceDependency[]
  actions: WorkflowAction[]
}
