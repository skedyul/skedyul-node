import type { EnvSchema, EnvVariable, InstallPhase } from './types/env'

export type { InstallPhase }

/** Default install collection phase when omitted on install-scoped vars. */
export const DEFAULT_INSTALL_PHASE: InstallPhase = 'pre_install'

export function resolveInstallPhase(
  def: Pick<EnvVariable, 'scope' | 'installPhase' | 'required'>,
): InstallPhase | null {
  if (def.scope === 'provision') {
    return null
  }

  if (def.installPhase === 'post_install' || def.installPhase === 'pre_install') {
    return def.installPhase
  }

  // Legacy install-scoped vars without installPhase: required → pre_install, optional → post_install
  if (def.scope === 'install') {
    return def.required ? 'pre_install' : 'post_install'
  }

  // Legacy install.config entries without scope default to pre_install
  return DEFAULT_INSTALL_PHASE
}

export function isPreInstallEnvVar(def: Pick<EnvVariable, 'scope' | 'installPhase' | 'required'>): boolean {
  return resolveInstallPhase(def) === 'pre_install'
}

export function isPostInstallEnvVar(def: Pick<EnvVariable, 'scope' | 'installPhase' | 'required'>): boolean {
  return resolveInstallPhase(def) === 'post_install'
}

export function filterEnvSchemaByInstallPhase(
  env: EnvSchema | undefined,
  phase: InstallPhase,
): EnvSchema {
  if (!env) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(env).filter(([, def]) => resolveInstallPhase(def) === phase),
  )
}

export function splitProvisionEnvSchema(env: EnvSchema | undefined): {
  global: EnvSchema
  preInstall: EnvSchema
  postInstall: EnvSchema
} {
  const global: EnvSchema = {}
  const preInstall: EnvSchema = {}
  const postInstall: EnvSchema = {}

  if (!env) {
    return { global, preInstall, postInstall }
  }

  for (const [key, def] of Object.entries(env)) {
    if (def.scope === 'install') {
      if (isPostInstallEnvVar(def)) {
        postInstall[key] = def
      } else {
        preInstall[key] = def
      }
      continue
    }

    global[key] = def
  }

  return { global, preInstall, postInstall }
}
