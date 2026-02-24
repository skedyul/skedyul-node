/**
 * Workflow definition types.
 *
 * Workflows define automation templates that can be triggered
 * by events or user actions.
 */

import type { BaseDefinition } from './base'
import type { ResourceDependency } from './resource'

/**
 * Input definition for a workflow action.
 */
export interface WorkflowActionInput {
  /** Input key/name */
  key: string
  /** Human-readable label */
  label: string
  /** Reference to a field on an entity */
  fieldRef?: {
    fieldHandle: string
    entityHandle: string
  }
  /** Liquid template for the input value */
  template?: string
}

/**
 * Action definition within a workflow.
 */
export interface WorkflowAction {
  /** Human-readable label */
  label: string
  /** Unique identifier within the workflow */
  handle: string
  /** Whether this action can process multiple records at once */
  batch?: boolean
  /** Entity handle this action operates on */
  entityHandle?: string
  /** Input definitions */
  inputs?: WorkflowActionInput[]
}

/**
 * Workflow definition.
 */
export interface WorkflowDefinition extends BaseDefinition {
  /** Path to the workflow YAML file */
  path: string
  /** Resource dependencies that must exist before this workflow can run */
  requires?: ResourceDependency[]
  /** Actions available in this workflow */
  actions: WorkflowAction[]
}
