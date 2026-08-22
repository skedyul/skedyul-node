import { callCliApi } from '../utils/auth'
import { cliApi, type CliContext } from './context'

export interface LinkAppInput {
  appHandle: string
  workplaceSubdomain: string
}

export interface LinkAppResult {
  appId: string
  appHandle: string
  appVersionId: string
  appVersionHandle: string
  appInstallationId: string
  workplaceId: string
  workplaceSubdomain: string
  isNewVersion: boolean
  isNewInstallation: boolean
}

export interface InvokeToolInput {
  appInstallationId: string
  toolName: string
  args?: Record<string, unknown>
  timeout?: number
}

export interface InvokeToolResult {
  success: boolean
  result: unknown
  error?: string
  availableTools?: string[]
}

export interface InstallationStatusResult {
  status?: string
  appInstallationId?: string
  [key: string]: unknown
}

export interface SyncResourcesResult {
  tools?: { synced: number; disabled: number }
  webhooks?: { synced: number; disabled: number }
  internalModels?: {
    modelsCreated: number
    modelsUpdated: number
    fieldsCreated: number
    relationshipsCreated: number
  }
  pendingMigration?: {
    migrationId: string
    impacts: Array<{
      operationType: string
      resourceType: string
      resourceHandle: string
      affectedRecords?: number
      message?: string
      isDestructive?: boolean
    }>
    timeoutMinutes: number
    createdAt: string
  }
  error?: string
}

export interface PlatformTool {
  id: string
  name: string
  displayName?: string
  description?: string
  kind?: string
  [key: string]: unknown
}

export async function linkApp(
  ctx: CliContext,
  input: LinkAppInput,
): Promise<LinkAppResult> {
  return callCliApi<LinkAppResult>(cliApi(ctx), '/link', {
    appHandle: input.appHandle,
    workplaceSubdomain: input.workplaceSubdomain,
  })
}

export async function registerEndpoint(
  ctx: CliContext,
  input: {
    appVersionId: string
    invokeEndpoint: string
    config?: Record<string, unknown>
  },
): Promise<unknown> {
  return callCliApi(cliApi(ctx), '/register-endpoint', {
    appVersionId: input.appVersionId,
    invokeEndpoint: input.invokeEndpoint,
    config: input.config,
  })
}

export async function unregisterEndpoint(
  ctx: CliContext,
  input: { appVersionId: string },
): Promise<unknown> {
  return callCliApi(cliApi(ctx), '/unregister-endpoint', {
    appVersionId: input.appVersionId,
  })
}

export async function heartbeat(
  ctx: CliContext,
  input: { appVersionId: string; config?: Record<string, unknown> },
): Promise<unknown> {
  return callCliApi(cliApi(ctx), '/heartbeat', {
    appVersionId: input.appVersionId,
    config: input.config,
  })
}

export async function installApp(
  ctx: CliContext,
  input: { appVersionId: string; env?: Record<string, string> },
): Promise<unknown> {
  return callCliApi(cliApi(ctx), '/install', {
    appVersionId: input.appVersionId,
    env: input.env,
  })
}

export async function uninstallApp(
  ctx: CliContext,
  input: { appInstallationId: string; deleteFields?: boolean },
): Promise<unknown> {
  return callCliApi(cliApi(ctx), '/uninstall', {
    appInstallationId: input.appInstallationId,
    deleteFields: input.deleteFields,
  })
}

export async function getInstallation(
  ctx: CliContext,
  input: { appVersionId: string },
): Promise<InstallationStatusResult> {
  return callCliApi<InstallationStatusResult>(cliApi(ctx), '/installation', {
    appVersionId: input.appVersionId,
  })
}

export async function syncResources(
  ctx: CliContext,
  input: {
    appVersionId: string
    workplaceSubdomain: string
    config: Record<string, unknown>
  },
): Promise<SyncResourcesResult> {
  return callCliApi<SyncResourcesResult>(cliApi(ctx), '/sync-resources', {
    appVersionId: input.appVersionId,
    workplaceSubdomain: input.workplaceSubdomain,
    config: input.config,
  })
}

export async function listTools(
  ctx: CliContext,
  input: {
    workplaceId: string
    name?: string
    toolId?: string
    kind?: string
  },
): Promise<{ success: boolean; tools?: PlatformTool[]; tool?: PlatformTool }> {
  return callCliApi(cliApi(ctx), '/tools', undefined, {
    method: 'GET',
    query: {
      workplaceId: input.workplaceId,
      name: input.name,
      toolId: input.toolId,
      kind: input.kind,
    },
  })
}

export async function invokeTool(
  ctx: CliContext,
  input: InvokeToolInput,
): Promise<InvokeToolResult> {
  return callCliApi<InvokeToolResult>(cliApi(ctx), '/invoke-tool', {
    appInstallationId: input.appInstallationId,
    toolName: input.toolName,
    args: input.args ?? {},
    timeout: input.timeout,
  })
}

export const apps = {
  link: linkApp,
  registerEndpoint,
  unregisterEndpoint,
  heartbeat,
  install: installApp,
  uninstall: uninstallApp,
  installation: getInstallation,
  syncResources,
  listTools,
  invokeTool,
}
