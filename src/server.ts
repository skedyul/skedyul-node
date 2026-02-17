/**
 * Server module - re-exports from the server folder
 * 
 * This file maintains backward compatibility while the actual implementation
 * has been split into smaller, focused modules in the server/ folder.
 */

// Re-export everything from the server module
export {
  // Main factory function
  createSkedyulServer,
  server,
  
  // Types
  type RequestState,
  type CoreMethod,
  type ToolCallArgs,
  
  // Utilities
  normalizeBilling,
  toJsonSchema,
  isToolSchemaWithJson,
  getZodSchema,
  getJsonSchemaFromToolSchema,
  parseJsonRecord,
  parseNumberEnv,
  mergeRuntimeEnv,
  readRawRequestBody,
  parseJSONBody,
  sendJSON,
  sendHTML,
  getDefaultHeaders,
  createResponse,
  getListeningPort,
  
  // Handlers
  handleCoreMethod,
  buildToolMetadata,
  createRequestState,
  createCallToolHandler,
  parseHandlerEnvelope,
  buildRequestFromRaw,
  buildRequestScopedConfig,
  printStartupLog,
  padEnd,
  createDedicatedServerInstance,
  createServerlessInstance,
} from './server/index'
