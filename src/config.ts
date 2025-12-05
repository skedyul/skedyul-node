import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ─────────────────────────────────────────────────────────────────────────────
// Env Variable Definition
// ─────────────────────────────────────────────────────────────────────────────

export type EnvVisibility = 'visible' | 'encrypted'

export interface EnvVariableDefinition {
  /** Human-readable label for the variable */
  label: string
  /** Whether this variable is required */
  required?: boolean
  /** Visibility setting (encrypted values are hidden in UI) */
  visibility?: EnvVisibility
  /** Default value if not provided */
  default?: string
  /** Description/help text */
  description?: string
  /** Placeholder text for input fields */
  placeholder?: string
}

export type EnvSchema = Record<string, EnvVariableDefinition>

// ─────────────────────────────────────────────────────────────────────────────
// App Model Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface AppModelDefinition {
  /** Unique handle for the entity (e.g., 'client', 'patient') */
  entityHandle: string
  /** Human-readable label */
  label: string
  /** Description of what this model represents */
  description?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Install Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallConfig {
  /**
   * Per-install environment variables.
   * These are configured by the user when installing the app.
   * Values are stored per-installation and can differ between installs.
   */
  env?: EnvSchema
  /**
   * Model mappings required for this app.
   * Users will map these to their CRM models during installation.
   */
  appModels?: AppModelDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute Layer
// ─────────────────────────────────────────────────────────────────────────────

export type ComputeLayerType = 'serverless' | 'dedicated'
export type RuntimeType = 'node-22' | 'node-20' | 'node-18'

// ─────────────────────────────────────────────────────────────────────────────
// Main Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface SkedyulConfig {
  // ─────────────────────────────────────────────────────────────────────────
  // App Metadata
  // ─────────────────────────────────────────────────────────────────────────

  /** App name */
  name: string
  /** App version (semver) */
  version?: string
  /** App description */
  description?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Runtime Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /** Compute layer: 'serverless' (Lambda) or 'dedicated' (ECS/Docker) */
  computeLayer?: ComputeLayerType
  /** Runtime environment */
  runtime?: RuntimeType

  // ─────────────────────────────────────────────────────────────────────────
  // Paths
  // ─────────────────────────────────────────────────────────────────────────

  /** Path to the tool registry file (default: './src/registry.ts') */
  tools?: string
  /** Path to the workflows directory (default: './workflows') */
  workflows?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Global Environment Variables
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Global/version-level environment variables.
   * These are baked into the container and are the same for all installations.
   * Use for configuration that doesn't change per-install.
   */
  env?: EnvSchema

  // ─────────────────────────────────────────────────────────────────────────
  // Install Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Install-time configuration.
   * Defines what users need to configure when installing the app.
   */
  install?: InstallConfig
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a Skedyul app configuration with full type safety.
 *
 * @example
 * ```typescript
 * // skedyul.config.ts
 * import { defineConfig } from 'skedyul'
 *
 * export default defineConfig({
 *   name: 'My App',
 *   computeLayer: 'dedicated',
 *   tools: './src/registry.ts',
 *   env: {
 *     LOG_LEVEL: { label: 'Log Level', default: 'info' },
 *   },
 *   install: {
 *     env: {
 *       API_KEY: { label: 'API Key', required: true, visibility: 'encrypted' },
 *     },
 *   },
 * })
 * ```
 */
export function defineConfig(config: SkedyulConfig): SkedyulConfig {
  return config
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Loading Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default config file names to search for
 */
export const CONFIG_FILE_NAMES = [
  'skedyul.config.ts',
  'skedyul.config.js',
  'skedyul.config.mjs',
  'skedyul.config.cjs',
]

/**
 * Transpile a TypeScript config file to JavaScript
 */
async function transpileTypeScript(filePath: string): Promise<string> {
  const content = fs.readFileSync(filePath, 'utf-8')

  // Simple transpilation: remove type annotations and convert to CommonJS
  // For more complex configs, users should pre-compile or use a JS config
  let transpiled = content
    // Remove import type statements
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?\n?/g, '')
    // Convert import { defineConfig } from 'skedyul' to require
    .replace(
      /import\s+\{\s*defineConfig\s*\}\s+from\s+['"]skedyul['"]\s*;?\n?/g,
      '',
    )
    // Remove type annotations like : SkedyulConfig
    .replace(/:\s*SkedyulConfig/g, '')
    // Convert export default to module.exports
    .replace(/export\s+default\s+/, 'module.exports = ')
    // Replace defineConfig() wrapper with just the object
    .replace(/defineConfig\s*\(\s*\{/, '{')
    // Remove the closing paren from defineConfig
    .replace(/\}\s*\)\s*;?\s*$/, '}')

  return transpiled
}

/**
 * Load a Skedyul config from a file path
 */
export async function loadConfig(configPath: string): Promise<SkedyulConfig> {
  const absolutePath = path.resolve(configPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`)
  }

  const isTypeScript = absolutePath.endsWith('.ts')

  try {
    let moduleToLoad = absolutePath

    if (isTypeScript) {
      // Transpile TypeScript to a temp JS file
      const transpiled = await transpileTypeScript(absolutePath)
      const tempDir = os.tmpdir()
      const tempFile = path.join(tempDir, `skedyul-config-${Date.now()}.js`)
      fs.writeFileSync(tempFile, transpiled)
      moduleToLoad = tempFile

      try {
        const module = require(moduleToLoad)
        const config = module.default || module

        if (!config || typeof config !== 'object') {
          throw new Error('Config file must export a configuration object')
        }

        if (!config.name || typeof config.name !== 'string') {
          throw new Error('Config must have a "name" property')
        }

        return config as SkedyulConfig
      } finally {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // For JS files, use dynamic import
    const module = await import(moduleToLoad)
    const config = module.default || module

    if (!config || typeof config !== 'object') {
      throw new Error('Config file must export a configuration object')
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Config must have a "name" property')
    }

    return config as SkedyulConfig
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Validate a config object
 */
export function validateConfig(config: SkedyulConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Required fields
  if (!config.name) {
    errors.push('Missing required field: name')
  }

  // Validate computeLayer
  if (config.computeLayer && !['serverless', 'dedicated'].includes(config.computeLayer)) {
    errors.push(`Invalid computeLayer: ${config.computeLayer}. Must be 'serverless' or 'dedicated'`)
  }

  // Validate runtime
  if (config.runtime && !['node-22', 'node-20', 'node-18'].includes(config.runtime)) {
    errors.push(`Invalid runtime: ${config.runtime}. Must be 'node-22', 'node-20', or 'node-18'`)
  }

  // Validate env schema
  if (config.env) {
    for (const [key, def] of Object.entries(config.env)) {
      if (!def.label) {
        errors.push(`env.${key}: Missing required field 'label'`)
      }
      if (def.visibility && !['visible', 'encrypted'].includes(def.visibility)) {
        errors.push(`env.${key}: Invalid visibility '${def.visibility}'`)
      }
    }
  }

  // Validate install.env schema
  if (config.install?.env) {
    for (const [key, def] of Object.entries(config.install.env)) {
      if (!def.label) {
        errors.push(`install.env.${key}: Missing required field 'label'`)
      }
      if (def.visibility && !['visible', 'encrypted'].includes(def.visibility)) {
        errors.push(`install.env.${key}: Invalid visibility '${def.visibility}'`)
      }
    }
  }

  // Validate appModels
  if (config.install?.appModels) {
    for (let i = 0; i < config.install.appModels.length; i++) {
      const model = config.install.appModels[i]
      if (!model.entityHandle) {
        errors.push(`install.appModels[${i}]: Missing required field 'entityHandle'`)
      }
      if (!model.label) {
        errors.push(`install.appModels[${i}]: Missing required field 'label'`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Get all required install env keys from a config
 */
export function getRequiredInstallEnvKeys(config: SkedyulConfig): string[] {
  if (!config.install?.env) return []

  return Object.entries(config.install.env)
    .filter(([, def]) => def.required)
    .map(([key]) => key)
}

/**
 * Get all env keys (both global and install) from a config
 */
export function getAllEnvKeys(config: SkedyulConfig): { global: string[]; install: string[] } {
  return {
    global: config.env ? Object.keys(config.env) : [],
    install: config.install?.env ? Object.keys(config.install.env) : [],
  }
}

