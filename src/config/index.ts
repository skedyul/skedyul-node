/**
 * Config module - re-exports all config types and utilities
 */

// Re-export all types
export * from './types'

// Re-export app config types
export type {
  InstallConfig,
  ProvisionConfig,
  SkedyulConfig,
  SerializableSkedyulConfig,
} from './app-config'
export { defineConfig } from './app-config'

// Re-export handler types (from main types via app-config)
export type {
  InstallHandlerContext,
  InstallHandlerResult,
  InstallHandler,
  InstallHandlerResponseOAuth,
  InstallHandlerResponseStandard,
  HasOAuthCallback,
  ServerHooksWithOAuth,
  ServerHooksWithoutOAuth,
  ProvisionHandlerContext,
  ProvisionHandlerResult,
  ProvisionHandler,
  ServerHooks,
} from './app-config'

// Re-export loader utilities
export { CONFIG_FILE_NAMES, loadConfig, validateConfig } from './loader'

// Re-export helper utilities
export { getAllEnvKeys, getRequiredInstallEnvKeys } from './utils'
