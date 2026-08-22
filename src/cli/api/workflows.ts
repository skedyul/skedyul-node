import { parse as parseYaml } from 'yaml'
import { validateWorkflowYAML } from '../../workflows/types'
import { callCliApi } from '../utils/auth'
import { cliApi, getWorkplaceToken, type CliContext } from './context'

export interface WorkflowVersion {
  id: string
  version: number | null
  versionLabel: string | null
  contentHash: string | null
  createdAt: string
  isTriggerVersion?: boolean
}

export interface WorkflowRecord {
  id: string
  handle: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  triggerVersionId: string | null
  triggerVersion: number | null
  triggerVersionLabel: string | null
  versions?: WorkflowVersion[]
}

export interface WorkflowFieldError {
  code: string
  message: string
}

export interface DeployWorkflowResult {
  success: boolean
  workflow: WorkflowRecord | null
  version: WorkflowVersion | null
  isNew: boolean
  reusedVersion: boolean
  pendingBuild: boolean
  message?: string
  errors?: Record<string, WorkflowFieldError>
  error?: string
}

export interface ValidateWorkflowResult {
  success: boolean
  valid: boolean
  handle?: string
  name?: string
  errors?: Record<string, WorkflowFieldError>
  error?: string
}

export interface WorkflowInputField {
  name: string
  type: string
  required: boolean
  description?: string
  label?: string
}

export interface WorkflowSchema {
  handle: string
  name: string
  description?: string
  version: number
  versionId: string
  inputs: WorkflowInputField[]
  error?: string
}

export interface RunWorkflowResult {
  success: boolean
  workflowRunId: string
  status: string
  workflowId: string
  workflowVersionId: string
  version: number
  error?: string
}

export interface WorkflowRunStep {
  id: string
  handle: string
  name: string
  status: string
  startedAt: string | null
  completedAt: string | null
}

export interface WorkflowRunStatus {
  success: boolean
  workflowRunId: string
  status: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  steps: WorkflowRunStep[]
  error?: string
}

export interface PublishWorkflowResult {
  success: boolean
  workflowId: string
  workflowVersionId: string
  version: number
}

export interface PullWorkflowResult {
  success: boolean
  yaml: string
  version: number
  handle: string
}

/** Local Zod/YAML check used by CLI before any server call. */
export function validateWorkflowContent(yamlContent: string): { content: string } {
  let rawWorkflow: unknown
  try {
    rawWorkflow = parseYaml(yamlContent)
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`)
  }

  const validation = validateWorkflowYAML(rawWorkflow)
  if (!validation.success) {
    const errorMessages = validation.error.issues
      .map((e) => `  - ${String(e.path.join('.')) || '(root)'}: ${e.message}`)
      .join('\n')
    throw new Error(`Workflow validation failed:\n${errorMessages}`)
  }

  return { content: yamlContent }
}

export async function listWorkflows(
  ctx: CliContext,
  workplace: string,
): Promise<WorkflowRecord[]> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  const result = await callCliApi<{
    success: boolean
    workflows: WorkflowRecord[]
    error?: string
  }>(cliApi(ctx), '/workflows', undefined, {
    method: 'GET',
    query: { workplaceId: workplaceToken.workplaceId },
  })
  if (!result.success) {
    throw new Error(result.error || 'Failed to list workflows')
  }
  return result.workflows
}

export async function getWorkflow(
  ctx: CliContext,
  workplace: string,
  handle: string,
): Promise<WorkflowRecord> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  const result = await callCliApi<{
    success: boolean
    workflow: WorkflowRecord
    error?: string
  }>(cliApi(ctx), '/workflows', undefined, {
    method: 'GET',
    query: { workplaceId: workplaceToken.workplaceId, handle },
  })
  if (!result.success) {
    throw new Error(result.error || 'Failed to get workflow')
  }
  return result.workflow
}

export async function listWorkflowVersions(
  ctx: CliContext,
  workplace: string,
  handle: string,
): Promise<WorkflowVersion[]> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  const result = await callCliApi<{
    success: boolean
    workflow: WorkflowRecord
    error?: string
  }>(cliApi(ctx), '/workflows', undefined, {
    method: 'GET',
    query: {
      workplaceId: workplaceToken.workplaceId,
      handle,
      action: 'versions',
    },
  })
  if (!result.success) {
    throw new Error(result.error || 'Failed to list versions')
  }
  return result.workflow.versions ?? []
}

export async function validateWorkflow(
  ctx: CliContext,
  workplace: string,
  yamlContent: string,
): Promise<ValidateWorkflowResult> {
  validateWorkflowContent(yamlContent)
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<ValidateWorkflowResult>(cliApi(ctx), '/workflows', {
    action: 'validate',
    workplaceId: workplaceToken.workplaceId,
    yamlContent,
  })
}

export interface DeployWorkflowOptions {
  publish?: boolean
  versionLabel?: string
}

export async function deployWorkflow(
  ctx: CliContext,
  workplace: string,
  yamlContent: string,
  options: DeployWorkflowOptions = {},
): Promise<DeployWorkflowResult> {
  validateWorkflowContent(yamlContent)
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<DeployWorkflowResult>(cliApi(ctx), '/workflows', {
    action: 'deploy',
    workplaceId: workplaceToken.workplaceId,
    yamlContent,
    publish: options.publish ?? true,
    versionLabel: options.versionLabel,
  })
}

export async function publishWorkflow(
  ctx: CliContext,
  workplace: string,
  handle: string,
  version: number,
): Promise<PublishWorkflowResult> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<PublishWorkflowResult>(cliApi(ctx), '/workflows', {
    action: 'publish',
    workplaceId: workplaceToken.workplaceId,
    handle,
    version,
  })
}

export async function pullWorkflow(
  ctx: CliContext,
  workplace: string,
  handle: string,
  version?: number,
): Promise<PullWorkflowResult> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<PullWorkflowResult>(cliApi(ctx), '/workflows', undefined, {
    method: 'GET',
    query: {
      workplaceId: workplaceToken.workplaceId,
      handle,
      action: 'pull',
      version: version !== undefined ? String(version) : undefined,
    },
  })
}

export async function getWorkflowSchema(
  ctx: CliContext,
  workplace: string,
  handle: string,
  version?: number,
): Promise<WorkflowSchema> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<WorkflowSchema>(cliApi(ctx), '/workflow-schema', undefined, {
    method: 'GET',
    query: {
      workplaceId: workplaceToken.workplaceId,
      handle,
      version: version !== undefined ? String(version) : undefined,
    },
  })
}

export async function runWorkflow(
  ctx: CliContext,
  workplace: string,
  handle: string,
  options: { version?: number; inputs?: Record<string, string> } = {},
): Promise<RunWorkflowResult> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<RunWorkflowResult>(cliApi(ctx), '/workflows/run', {
    workplaceId: workplaceToken.workplaceId,
    handle,
    version: options.version,
    inputs: options.inputs ?? {},
  })
}

export async function getWorkflowRun(
  ctx: CliContext,
  workplace: string,
  workflowRunId: string,
): Promise<WorkflowRunStatus> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<WorkflowRunStatus>(cliApi(ctx), '/workflows/run', undefined, {
    method: 'GET',
    query: {
      workplaceId: workplaceToken.workplaceId,
      workflowRunId,
    },
  })
}

export const workflows = {
  list: listWorkflows,
  get: getWorkflow,
  versions: listWorkflowVersions,
  validate: validateWorkflow,
  validateLocal: validateWorkflowContent,
  deploy: deployWorkflow,
  publish: publishWorkflow,
  pull: pullWorkflow,
  schema: getWorkflowSchema,
  run: runWorkflow,
  getRun: getWorkflowRun,
}
