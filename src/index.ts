import { z } from 'zod'

export * from './types'
export * from './schemas'
export { server } from './server'
// Re-export zod so integrations use the same instance
export { z }
export {
  workplace,
  communicationChannel,
  instance,
  configure,
  getConfig,
} from './core/client'
export type {
  InstanceContext,
  InstanceData,
  InstanceMeta,
  InstancePagination,
  InstanceListResult,
  InstanceListArgs,
} from './core/client'

// Default export for ESM compatibility when importing from CJS
export default { z }
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

