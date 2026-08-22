import type { CRMSchema } from '../../schemas/crm-schema'
import { callCliApi } from '../utils/auth'
import { cliApi, getWorkplaceToken, type CliContext } from './context'

export interface SchemaImpact {
  operationType: string
  resourceType: string
  resourceHandle: string
  affectedRecords?: number
  message?: string
  isDestructive: boolean
}

export interface SchemaPushResult {
  success: boolean
  migrationId?: string
  requiresApproval: boolean
  hasChanges?: boolean
  impacts: SchemaImpact[]
  error?: string
}

export interface SchemaPullResult {
  success: boolean
  schema: CRMSchema
  workplaceName: string
  error?: string
}

export interface CrmModelSummary {
  id: string
  handle: string
  name: string
  namePlural?: string
  fieldCount: number
  instanceCount: number
}

export interface ModelsListResult {
  success: boolean
  models: CrmModelSummary[]
  error?: string
}

export async function listModels(
  ctx: CliContext,
  workplace: string,
): Promise<CrmModelSummary[]> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  const result = await callCliApi<ModelsListResult>(
    cliApi(ctx),
    '/crm-models',
    undefined,
    { method: 'GET', query: { workplaceId: workplaceToken.workplaceId } },
  )
  if (!result.success) {
    throw new Error(result.error || 'Failed to list models')
  }
  return result.models
}

export async function pullSchema(
  ctx: CliContext,
  workplace: string,
): Promise<{ schema: CRMSchema; workplaceName: string }> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  const result = await callCliApi<SchemaPullResult>(
    cliApi(ctx),
    '/crm-schema',
    undefined,
    { method: 'GET', query: { workplaceId: workplaceToken.workplaceId } },
  )
  if (!result.success) {
    throw new Error(result.error || 'Failed to pull schema')
  }
  return { schema: result.schema, workplaceName: result.workplaceName }
}

export interface PushSchemaOptions {
  dryRun?: boolean
  autoApprove?: boolean
}

async function postSchema(
  ctx: CliContext,
  workplace: string,
  schema: CRMSchema,
  options: PushSchemaOptions,
): Promise<SchemaPushResult> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<SchemaPushResult>(cliApi(ctx), '/crm-schema', {
    workplace,
    workplaceId: workplaceToken.workplaceId,
    schema,
    dryRun: options.dryRun ?? false,
    autoApprove: options.autoApprove ?? false,
    schemaName: schema.name,
    schemaVersion: schema.version,
  })
}

export async function diffSchema(
  ctx: CliContext,
  workplace: string,
  schema: CRMSchema,
): Promise<SchemaPushResult> {
  return postSchema(ctx, workplace, schema, { dryRun: true })
}

export async function approveMigration(
  ctx: CliContext,
  migrationId: string,
): Promise<void> {
  await callCliApi(cliApi(ctx), '/approve-migration', { migrationId })
}

export async function pushSchema(
  ctx: CliContext,
  workplace: string,
  schema: CRMSchema,
  options: PushSchemaOptions = {},
): Promise<SchemaPushResult> {
  const result = await postSchema(ctx, workplace, schema, {
    dryRun: options.dryRun ?? false,
    autoApprove: options.autoApprove ?? false,
  })

  if (
    !options.dryRun &&
    options.autoApprove &&
    result.requiresApproval &&
    result.migrationId
  ) {
    await approveMigration(ctx, result.migrationId)
    return {
      ...result,
      requiresApproval: false,
    }
  }

  return result
}

export const crm = {
  listModels,
  pullSchema,
  diffSchema,
  pushSchema,
  approveMigration,
}
