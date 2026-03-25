/**
 * Server module - re-exports from the server folder
 * 
 * This file maintains backward compatibility while the actual implementation
 * has been split into smaller, focused modules in the server/ folder.
 */

// Re-export public API from the server module
export {
  // Main factory function
  createSkedyulServer,
  server,
  
  // Types
  type RuntimeSkedyulConfig,
  
  // Schema utilities (used by integrations for tool definitions)
  toJsonSchema,
  isToolSchemaWithJson,
  getZodSchema,
  getJsonSchemaFromToolSchema,
} from './server/index'
