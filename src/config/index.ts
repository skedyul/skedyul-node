/**
 * Config module - re-exports all config types and utilities.
 *
 * NAMING CONVENTIONS:
 * - All type literals use lowercase (e.g., 'string', 'internal', 'one_to_many')
 * - Use `handle` for unique identifiers (snake_case)
 * - Use `label` for display names (human-readable)
 * - Use `description` for optional explanatory text
 * - All definition types extend BaseDefinition
 */

// Re-export all types from types/
export * from './types'

// Re-export app config types
export type {
  InstallConfig,
  ProvisionConfig,
  BuildConfig,
  CorsOptions,
  SkedyulConfig,
  SerializableSkedyulConfig,
} from './app-config'
export { defineConfig } from './app-config'

// Re-export define helpers for modular config files
export {
  defineModel,
  defineChannel,
  definePage,
  defineWorkflow,
  defineAgent,
  defineEnv,
  defineNavigation,
} from './define'

// Re-export loader utilities
export { CONFIG_FILE_NAMES, loadConfig, validateConfig } from './loader'

// Re-export helper utilities
export { getAllEnvKeys, getRequiredInstallEnvKeys } from './utils'
