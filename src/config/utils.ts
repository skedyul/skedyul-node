import type { SkedyulConfig, ProvisionConfig } from './app-config'

/**
 * Get all environment variable keys from the config.
 * Returns separate arrays for global and install-level keys.
 * Note: With the new config structure, all env is at provision level (global).
 */
export function getAllEnvKeys(config: SkedyulConfig): { global: string[]; install: string[] } {
  // Resolve provision if it's already resolved (not a Promise)
  const provision = config.provision && 'env' in config.provision 
    ? config.provision as ProvisionConfig 
    : undefined
  
  const globalKeys = provision?.env ? Object.keys(provision.env) : []
  
  // Install-level env is deprecated in the new structure
  return {
    global: globalKeys,
    install: [],
  }
}

/**
 * Get required install-level environment variable keys.
 * Note: With the new config structure, install-level env is deprecated.
 * All required env vars are now at provision level.
 */
export function getRequiredInstallEnvKeys(config: SkedyulConfig): string[] {
  // Resolve provision if it's already resolved (not a Promise)
  const provision = config.provision && 'env' in config.provision 
    ? config.provision as ProvisionConfig 
    : undefined
  
  if (!provision?.env) return []
  
  return Object.entries(provision.env)
    .filter(([, def]) => def.required)
    .map(([key]) => key)
}
