import { callCliApi } from './auth'
import { deleteEnvFile, loadEnvFile, saveEnvFile, type LinkConfig } from './link'
import { loadInstallConfig, type InstallEnvField } from './config'

export type EnvConfigField = InstallEnvField

export function isInstallScopedField(field: EnvConfigField): boolean {
  return field.scope !== 'provision'
}

export function isProvisionScopedField(field: EnvConfigField): boolean {
  return field.scope === 'provision'
}

export function applyEnvToProcess(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }
}

export async function buildProvisionEnvFields(): Promise<
  Array<{ key: string; field: EnvConfigField }>
> {
  const installConfig = await loadInstallConfig()
  if (!installConfig?.env) {
    return []
  }

  return Object.entries(installConfig.env)
    .filter(([, field]) => isProvisionScopedField(field))
    .map(([key, field]) => ({ key, field }))
}

export async function buildInstallScopedEnvFields(): Promise<
  Array<{ key: string; field: EnvConfigField }>
> {
  const installConfig = await loadInstallConfig()
  if (!installConfig?.env) {
    return []
  }

  return Object.entries(installConfig.env)
    .filter(([, field]) => isInstallScopedField(field))
    .map(([key, field]) => ({ key, field }))
}

interface FetchEnvResponse {
  env: Record<string, string>
}

/**
 * Fetch env vars from Skedyul DB (decrypted) for the given scope.
 */
export async function fetchEnvFromPlatform(
  linkConfig: LinkConfig,
  token: string,
  scope: 'provision' | 'install',
): Promise<Record<string, string>> {
  const result = await callCliApi<FetchEnvResponse>(
    { serverUrl: linkConfig.serverUrl, token },
    '/version-variables',
    undefined,
    {
      method: 'GET',
      query: {
        appVersionId: linkConfig.appVersionId,
        appInstallationId: linkConfig.appInstallationId,
        scope,
      },
    },
  )
  return result.env ?? {}
}

/**
 * Upsert provision-scoped env vars to Skedyul (APP_VERSION level).
 */
export async function syncProvisionEnvToPlatform(
  linkConfig: LinkConfig,
  token: string,
  env: Record<string, string>,
  envFields?: Array<{ key: string; field: EnvConfigField }>,
  options?: { quiet?: boolean },
): Promise<void> {
  const fields = envFields ?? (await buildProvisionEnvFields())

  const variables = fields
    .filter(({ key }) => env[key])
    .map(({ key, field }) => ({
      key,
      value: env[key],
      label: field.label,
      description: field.description ?? null,
      visibility:
        field.visibility === 'encrypted'
          ? ('ENCRYPTED' as const)
          : ('VISIBLE' as const),
      scope: 'provision' as const,
    }))

  if (variables.length === 0) {
    return
  }

  try {
    const result = await callCliApi<{ upserted: number }>(
      { serverUrl: linkConfig.serverUrl, token },
      '/version-variables',
      {
        appVersionId: linkConfig.appVersionId,
        variables,
      },
    )
    if (!options?.quiet) {
      console.log(`✓ Synced ${result.upserted} provision variable(s) to Skedyul`)
    }
  } catch (error) {
    if (!options?.quiet) {
      console.warn(
        `\n⚠ Could not sync provision env to Skedyul: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

/**
 * Upsert install-scoped env vars to Skedyul (APP_INSTALL level).
 */
export async function syncInstallEnvToPlatform(
  linkConfig: LinkConfig,
  token: string,
  env: Record<string, string>,
  envFields?: Array<{ key: string; field: EnvConfigField }>,
): Promise<void> {
  const fields = envFields ?? (await buildInstallScopedEnvFields())

  const variables = fields
    .filter(({ key }) => env[key])
    .map(({ key, field }) => ({
      key,
      value: env[key],
      label: field.label,
      description: field.description ?? null,
      visibility:
        field.visibility === 'encrypted'
          ? ('ENCRYPTED' as const)
          : ('VISIBLE' as const),
      scope: 'install' as const,
    }))

  if (variables.length === 0) {
    return
  }

  try {
    const result = await callCliApi<{ upserted: number }>(
      { serverUrl: linkConfig.serverUrl, token },
      '/version-variables',
      {
        appVersionId: linkConfig.appVersionId,
        appInstallationId: linkConfig.appInstallationId,
        variables,
      },
    )
    console.log(`✓ Synced ${result.upserted} install variable(s) to Skedyul`)
  } catch (error) {
    console.warn(
      `\n⚠ Could not sync install env to Skedyul: ${error instanceof Error ? error.message : String(error)}`,
    )
    console.warn('  Variables were saved locally only.')
  }
}

/** @deprecated Use fetchEnvFromPlatform with scope 'install' */
export async function buildInstallEnvFields(): Promise<
  Array<{ key: string; field: EnvConfigField }>
> {
  return buildInstallScopedEnvFields()
}

/** Load install-scoped vars from local file (dev install cache). */
export function loadLocalInstallEnv(
  workplaceSubdomain: string,
): Record<string, string> {
  return loadEnvFile(workplaceSubdomain)
}

/**
 * Remove provision-scoped keys from the local .env file.
 * Provision vars live in Skedyul DB — the local file is for install-scoped vars only.
 */
export async function pruneProvisionKeysFromLocalEnv(
  workplaceSubdomain: string,
): Promise<string[]> {
  const provisionFields = await buildProvisionEnvFields()
  if (provisionFields.length === 0) {
    return []
  }

  const localEnv = loadEnvFile(workplaceSubdomain)
  const removed: string[] = []

  for (const { key } of provisionFields) {
    if (localEnv[key] !== undefined) {
      delete localEnv[key]
      removed.push(key)
    }
  }

  if (removed.length === 0) {
    return removed
  }

  if (Object.keys(localEnv).length === 0) {
    deleteEnvFile(workplaceSubdomain)
  } else {
    saveEnvFile(workplaceSubdomain, localEnv)
  }

  return removed
}
