export * from './types'
export * from './schemas'
export { server } from './server'
// Re-export zod so integrations use the same instance (avoids _zod errors)
export { z } from 'zod'
export { workplace, communicationChannel, configure, getConfig } from './core/client'
export {
  defineConfig,
  loadConfig,
  validateConfig,
  getRequiredInstallEnvKeys,
  getAllEnvKeys,
  CONFIG_FILE_NAMES,
} from './config'
export type {
  SkedyulConfig,
  SerializableSkedyulConfig,
  EnvVariableDefinition,
  EnvSchema,
  EnvVisibility,
  InstallConfig,
  AppModelDefinition,
  ComputeLayerType,
  // Install handler types
  InstallHandlerContext,
  InstallHandlerResult,
  InstallHandler,
  PreInstallConfig,
  PostInstallConfig,
  // Communication Channel types
  AppFieldVisibility,
  AppFieldDefinition,
  ChannelToolBindings,
  ChannelIdentifierType,
  ChannelIdentifierValue,
  CommunicationChannelDefinition,
  // Workflow types
  WorkflowActionInput,
  WorkflowAction,
  WorkflowDefinition,
} from './config'

