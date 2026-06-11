import * as fs from 'fs'
import * as path from 'path'
import type { ModelDefinition, RelationshipDefinition } from '../../config/types'
import type { EnvScope } from '../../config/types/env'
import type { ProvisionConfig } from '../../config/app-config'
import type { ToolRegistry, WebhookRegistry } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SkedyulAppConfig {
  name: string
  handle: string
  description?: string
  compute?: {
    layer: 'serverless' | 'dedicated'
    size?: string
  }
  tools?: unknown[]
  install?: {
    config?: unknown[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Loading
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_FILENAMES = [
  'skedyul.config.ts',
  'skedyul.config.js',
  'skedyul.config.mjs',
]

export function findConfigFile(projectDir?: string): string | null {
  const dir = projectDir ?? process.cwd()

  for (const filename of CONFIG_FILENAMES) {
    const filePath = path.join(dir, filename)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }

  return null
}

/**
 * Parse config file to extract basic fields without full module loading.
 * This is a fallback when dynamic import fails (e.g., JSON import issues).
 */
function parseConfigFromSource(configPath: string): SkedyulAppConfig | null {
  try {
    const content = fs.readFileSync(configPath, 'utf-8')

    // Extract name using regex (look for top-level name, not nested in agents)
    // Match name: 'value' at the start of a line (with possible indentation of 2 spaces)
    const nameMatch = content.match(/^\s{0,2}name\s*:\s*['"`]([^'"`]+)['"`]/m)
    
    // Extract description
    const descMatch = content.match(/^\s{0,2}description\s*:\s*['"`]([^'"`]+)['"`]/m)

    // Try to get handle from package.json in the same directory
    const dir = path.dirname(configPath)
    const pkgPath = path.join(dir, 'package.json')
    let handle: string | null = null

    if (fs.existsSync(pkgPath)) {
      try {
        const pkgContent = fs.readFileSync(pkgPath, 'utf-8')
        const pkg = JSON.parse(pkgContent) as { name?: string }
        if (pkg.name) {
          // Extract handle from package name like "@skedyul-integrations/petbooqz" -> "petbooqz"
          const nameParts = pkg.name.split('/')
          handle = nameParts[nameParts.length - 1]
        }
      } catch {
        // Ignore package.json parse errors
      }
    }

    // Fallback: try to extract handle from config file (top-level only)
    if (!handle) {
      const handleMatch = content.match(/^\s{0,2}handle\s*:\s*['"`]([^'"`]+)['"`]/m)
      handle = handleMatch?.[1] ?? null
    }

    // If handle was found in config, prefer it over package.json derived handle
    const configHandleMatch = content.match(/^\s{0,2}handle\s*:\s*['"`]([^'"`]+)['"`]/m)
    if (configHandleMatch?.[1]) {
      handle = configHandleMatch[1]
    }

    if (!handle && !nameMatch) {
      return null
    }

    return {
      handle: handle ?? nameMatch?.[1] ?? 'unknown',
      name: nameMatch?.[1] ?? handle ?? 'Unknown App',
      description: descMatch?.[1],
    }
  } catch {
    return null
  }
}

export async function loadAppConfig(
  projectDir?: string,
): Promise<SkedyulAppConfig | null> {
  const configPath = findConfigFile(projectDir)

  if (!configPath) {
    return null
  }

  // For TypeScript files, always parse source directly to avoid dynamic import issues
  // (skedyul.config.ts often has nested imports that can't be resolved at runtime)
  if (configPath.endsWith('.ts')) {
    const fallbackConfig = parseConfigFromSource(configPath)
    if (fallbackConfig) {
      return fallbackConfig
    }
  }

  try {
    // For JS files, try to load normally
    const distPath = configPath
      .replace('skedyul.config.ts', 'dist/skedyul.config.js')
      .replace('skedyul.config.mjs', 'dist/skedyul.config.js')

    let module: { default?: unknown; config?: unknown }

    // Try using require() first (works better with CommonJS)
    try {
      if (fs.existsSync(distPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        module = require(distPath)
      } else if (configPath.endsWith('.js')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        module = require(configPath)
      } else {
        throw new Error('Need to use import for ESM')
      }
    } catch {
      // Fallback to dynamic import for ESM modules
      if (fs.existsSync(distPath)) {
        module = await import(distPath)
      } else {
        module = await import(configPath)
      }
    }

    const config = module.default ?? module.config ?? module

    if (!config || typeof config !== 'object') {
      return null
    }

    // Check if it has the required fields
    const configObj = config as Record<string, unknown>
    if (typeof configObj.handle === 'string') {
      return config as SkedyulAppConfig
    }

    return null
  } catch (error) {
    // If dynamic loading fails, try parsing the source file directly
    const fallbackConfig = parseConfigFromSource(configPath)
    if (fallbackConfig) {
      return fallbackConfig
    }

    console.error('Failed to load skedyul.config:', error)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Install Config Loading
// ─────────────────────────────────────────────────────────────────────────────

const INSTALL_CONFIG_PATHS = [
  'config/install.config.ts',
  'config/install.config.js',
  'install.config.ts',
  'install.config.js',
]

/** Modern integrations define env via skedyul.config provision (src/provision/env.ts) */
const PROVISION_ENV_PATHS = [
  'src/provision/env.ts',
  'src/provision/env.js',
  'dist/provision/env.js',
]

const PROVISION_CONFIG_PATHS = [
  'src/provision/index.ts',
  'src/provision/index.js',
  'dist/provision/index.js',
]

export interface InstallEnvField {
  label: string
  required?: boolean
  visibility?: 'visible' | 'encrypted'
  placeholder?: string
  description?: string
  scope?: 'provision' | 'install'
}

export interface InstallConfigData {
  env?: Record<string, InstallEnvField>
  /** SHARED model definitions (mapped to user's existing data during installation) */
  models?: ModelDefinition[]
  /** Relationship definitions between SHARED models */
  relationships?: RelationshipDefinition[]
}

export async function loadInstallConfig(
  projectDir?: string,
  debug = false,
): Promise<InstallConfigData | null> {
  const legacy = await loadLegacyInstallConfig(projectDir, debug)
  if (legacy) {
    return legacy
  }

  return loadProvisionEnvAsInstallConfig(projectDir, debug)
}

/**
 * Load env from legacy install.config files only (not provision/env.ts).
 */
export async function loadLegacyInstallConfig(
  projectDir?: string,
  debug = false,
): Promise<InstallConfigData | null> {
  return loadInstallConfigFromPaths(INSTALL_CONFIG_PATHS, projectDir, debug)
}

async function loadProvisionEnvAsInstallConfig(
  projectDir?: string,
  debug = false,
): Promise<InstallConfigData | null> {
  const dir = projectDir ?? process.cwd()

  for (const configPath of PROVISION_ENV_PATHS) {
    const fullPath = path.join(dir, configPath)
    if (!fs.existsSync(fullPath)) {
      continue
    }

    try {
      if (fullPath.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8')
        const parsed = parseEnvConfigFromSource(content)
        if (parsed?.env && Object.keys(parsed.env).length > 0) {
          return parsed
        }
      } else {
        const module = await import(fullPath)
        const env = module.default ?? module
        if (env && typeof env === 'object') {
          return { env: env as Record<string, InstallEnvField> }
        }
      }
    } catch (error) {
      console.warn(`Failed to load ${configPath}:`, error)
      continue
    }
  }

  return null
}

async function loadInstallConfigFromPaths(
  configPaths: string[],
  projectDir?: string,
  debug = false,
): Promise<InstallConfigData | null> {
  const dir = projectDir ?? process.cwd()

  if (debug) console.log(`[loadInstallConfig] Looking in: ${dir}`)

  for (const configPath of configPaths) {
    const fullPath = path.join(dir, configPath)
    if (debug) console.log(`[loadInstallConfig] Checking: ${fullPath}`)
    
    if (!fs.existsSync(fullPath)) {
      if (debug) console.log(`[loadInstallConfig] Not found: ${fullPath}`)
      continue
    }

    if (debug) console.log(`[loadInstallConfig] Found: ${fullPath}`)

    try {
      if (fullPath.endsWith('.ts')) {
        // For TypeScript files, try to load from compiled dist first
        const distPath = fullPath.replace(/\.ts$/, '.js').replace('/config/', '/dist/config/')
        if (debug) console.log(`[loadInstallConfig] Checking dist: ${distPath}`)
        
        if (fs.existsSync(distPath)) {
          try {
            const module = await import(distPath)
            const config = module.default ?? module
            if (debug) console.log(`[loadInstallConfig] Loaded from dist:`, Object.keys(config))
            if (config && typeof config === 'object') {
              return config as InstallConfigData
            }
          } catch (distError) {
            if (debug) console.log(`[loadInstallConfig] Dist import failed:`, distError)
            // Fall through to source parsing
          }
        }
        
        // Parse source directly as fallback
        if (debug) console.log(`[loadInstallConfig] Parsing source file...`)
        const content = fs.readFileSync(fullPath, 'utf-8')
        const parsed = parseInstallConfigFromSource(content)
        if (debug) console.log(`[loadInstallConfig] Parsed result:`, parsed ? Object.keys(parsed.env || {}) : 'null')
        if (parsed) {
          return parsed
        }
      } else {
        // JS files can be imported directly
        const module = await import(fullPath)
        const config = module.default ?? module
        if (config && typeof config === 'object') {
          return config as InstallConfigData
        }
      }
    } catch (error) {
      console.warn(`Failed to load ${configPath}:`, error)
      continue
    }
  }

  return null
}

function parseEnvFieldsFromBlock(envBlock: string): Record<string, InstallEnvField> {
  const envVars: Record<string, InstallEnvField> = {}
  const varStartPattern = /([A-Z][A-Z0-9_]*)\s*:\s*\{/g
  let varMatch

  while ((varMatch = varStartPattern.exec(envBlock)) !== null) {
    const varName = varMatch[1]
    const varStartIdx = varMatch.index + varMatch[0].length

    let varBraceCount = 1
    let varEndIdx = varStartIdx

    for (let i = varStartIdx; i < envBlock.length && varBraceCount > 0; i++) {
      if (envBlock[i] === '{') varBraceCount++
      else if (envBlock[i] === '}') varBraceCount--
      varEndIdx = i
    }

    const varContent = envBlock.substring(varStartIdx, varEndIdx)
    const field: InstallEnvField = { label: varName }

    const labelMatch = varContent.match(/label\s*:\s*['"`]([^'"`]+)['"`]/)
    if (labelMatch) field.label = labelMatch[1]

    const requiredMatch = varContent.match(/required\s*:\s*(true|false)/)
    if (requiredMatch) field.required = requiredMatch[1] === 'true'

    const visibilityMatch = varContent.match(/visibility\s*:\s*['"`](visible|encrypted)['"`]/)
    if (visibilityMatch) field.visibility = visibilityMatch[1] as 'visible' | 'encrypted'

    const placeholderMatch = varContent.match(/placeholder\s*:\s*['"`]([^'"`]+)['"`]/)
    if (placeholderMatch) field.placeholder = placeholderMatch[1]

    const descMatch = varContent.match(/description\s*:\s*['"`]([^'"`]+)['"`]/)
    if (descMatch) field.description = descMatch[1]

    const scopeMatch = varContent.match(/scope\s*:\s*['"`](provision|install)['"`]/)
    if (scopeMatch) field.scope = scopeMatch[1] as 'provision' | 'install'

    envVars[varName] = field
  }

  return envVars
}

function extractBracedBlock(content: string, openBraceIndex: number): string | null {
  let braceCount = 1
  let endIdx = openBraceIndex + 1

  for (let i = openBraceIndex + 1; i < content.length && braceCount > 0; i++) {
    if (content[i] === '{') braceCount++
    else if (content[i] === '}') braceCount--
    endIdx = i
  }

  if (braceCount !== 0) {
    return null
  }

  return content.substring(openBraceIndex + 1, endIdx)
}

/**
 * Parse env field definitions from install.config or provision/env.ts source.
 */
function parseEnvConfigFromSource(content: string): InstallConfigData | null {
  try {
    // install.config format: env: { ... }
    const envStartMatch = content.match(/\benv\s*:\s*\{/)
    if (envStartMatch && envStartMatch.index !== undefined) {
      const envBlock = extractBracedBlock(content, envStartMatch.index + envStartMatch[0].length - 1)
      if (envBlock) {
        return { env: parseEnvFieldsFromBlock(envBlock) }
      }
    }

    // provision/env.ts format: defineEnv({ ... })
    const defineEnvMatch = content.match(/defineEnv\s*\(\s*\{/)
    if (defineEnvMatch && defineEnvMatch.index !== undefined) {
      const envBlock = extractBracedBlock(content, defineEnvMatch.index + defineEnvMatch[0].length - 1)
      if (envBlock) {
        const env = parseEnvFieldsFromBlock(envBlock)
        if (Object.keys(env).length > 0) {
          return { env }
        }
      }
    }

    const hasModels = content.match(/\bmodels\s*:\s*\[/)
    if (hasModels) {
      return { env: {} }
    }

    return null
  } catch {
    return null
  }
}

/** @deprecated Use parseEnvConfigFromSource */
function parseInstallConfigFromSource(content: string): InstallConfigData | null {
  return parseEnvConfigFromSource(content)
}

// ─────────────────────────────────────────────────────────────────────────────
// Install Handler Loading
// ─────────────────────────────────────────────────────────────────────────────

const INSTALL_HANDLER_PATHS = [
  // Standard integration layout (used by bft, petbooqz, phone, etc.)
  'src/server/hooks/install.ts',
  'src/server/hooks/install.js',
  'dist/server/hooks/install.js',
  // Legacy paths
  'src/install.ts',
  'src/install.js',
  'dist/install.js',
  'build/install.js',
]

/**
 * Find and load the install handler from the project directory.
 * Returns the default export (install handler function) or null if not found.
 */
export async function loadInstallHandler(
  projectDir?: string,
): Promise<((ctx: unknown) => Promise<unknown>) | null> {
  const dir = projectDir ?? process.cwd()

  for (const handlerPath of INSTALL_HANDLER_PATHS) {
    const fullPath = path.join(dir, handlerPath)

    if (!fs.existsSync(fullPath)) {
      continue
    }

    try {
      let module: { default?: unknown }

      if (fullPath.endsWith('.ts')) {
        // Use tsx loader for TypeScript files
        const { loadTypeScriptFile } = await import('../utils')
        module = (await loadTypeScriptFile(fullPath)) as { default?: unknown }
      } else {
        module = await import(fullPath)
      }

      const handler = module.default
      if (typeof handler === 'function') {
        return handler as (ctx: unknown) => Promise<unknown>
      }
    } catch (error) {
      console.warn(
        `[loadInstallHandler] Failed to load ${handlerPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }
  }

  return null
}

function buildProvisionEnvFromInstallConfig(
  installEnv: Record<string, InstallEnvField>,
): Record<string, InstallEnvField & { scope?: EnvScope }> {
  return Object.fromEntries(
    Object.entries(installEnv).map(([key, def]) => [
      key,
      { ...def, scope: 'provision' as const },
    ]),
  )
}

/** Exclude provision-scoped vars mistakenly stored in install.env (legacy sync bug). */
export function filterInstallScopedEnv(
  env: Record<string, InstallEnvField & { scope?: string }>,
): Record<string, InstallEnvField> {
  return Object.fromEntries(
    Object.entries(env).filter(([, def]) => def.scope !== 'provision'),
  )
}

function buildInstallEnvForSync(
  legacyInstall: InstallConfigData | null,
  provisionConfig: ProvisionConfig | null,
): Record<string, InstallEnvField> | undefined {
  const installEnv: Record<string, InstallEnvField> = {}

  // Legacy install.config.ts — all vars are install-scoped
  if (legacyInstall?.env) {
    Object.assign(installEnv, legacyInstall.env)
  }

  // Modern provision.env — only scope: 'install'
  if (provisionConfig?.env) {
    for (const [key, def] of Object.entries(provisionConfig.env)) {
      if (def.scope === 'install') {
        installEnv[key] = def as InstallEnvField
      }
    }
  }

  return Object.keys(installEnv).length > 0 ? installEnv : undefined
}

/** Env vars passed to the install workflow (install-scoped only). */
export function filterEnvForInstallWorkflow(
  env: Record<string, string>,
  installConfig: InstallConfigData | null,
): Record<string, string> {
  const installKeys = new Set(
    Object.entries(installConfig?.env ?? {})
      .filter(([, def]) => def.scope === 'install')
      .map(([key]) => key),
  )

  if (installKeys.size === 0) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(env).filter(([key]) => installKeys.has(key)),
  )
}

/**
 * Load provision config (env, models, pages) directly from src/provision/index.ts.
 * Avoids resolving skedyul.config.ts dynamic imports which fail under the compiled CLI.
 */
export async function loadProvisionConfig(
  projectDir?: string,
): Promise<ProvisionConfig | null> {
  const dir = projectDir ?? process.cwd()
  const { loadTypeScriptFile } = await import('../utils')

  for (const configPath of PROVISION_CONFIG_PATHS) {
    const fullPath = path.join(dir, configPath)
    if (!fs.existsSync(fullPath)) {
      continue
    }

    try {
      let module: { default?: ProvisionConfig }
      if (fullPath.endsWith('.ts')) {
        module = (await loadTypeScriptFile(fullPath)) as { default?: ProvisionConfig }
      } else {
        module = await import(fullPath)
      }

      const config = module.default
      if (config && typeof config === 'object') {
        return config
      }
    } catch (error) {
      console.warn(
        `[loadProvisionConfig] Failed to load ${configPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  return null
}

/**
 * Build the executable.config payload synced to Skedyul during dev serve.
 * Includes full provision (env, models, pages) so Developer Console and install UI work.
 */
export async function buildExecutableSyncConfig(
  registry: ToolRegistry,
  inputSchemaToJson: (schema: unknown) => unknown,
  projectDir?: string,
  webhookRegistry?: WebhookRegistry,
): Promise<Record<string, unknown>> {
  const tools = Object.entries(registry).map(([name, tool]) => ({
    name,
    description: (tool as { description?: string }).description,
    inputSchema: inputSchemaToJson((tool as { inputSchema?: unknown }).inputSchema),
  }))

  const webhooks = webhookRegistry
    ? Object.values(webhookRegistry).map((webhook) => ({
        name: webhook.name,
        description: webhook.description,
        methods: webhook.methods ?? ['POST'],
        type: webhook.type ?? 'WEBHOOK',
      }))
    : []

  const appConfig = await loadAppConfig(projectDir)
  const legacyInstallConfig = await loadLegacyInstallConfig(projectDir)
  const installConfig = await loadInstallConfig(projectDir)
  const provisionConfig = await loadProvisionConfig(projectDir)

  let provision: ProvisionConfig | undefined = provisionConfig ?? undefined
  if (!provision?.env && legacyInstallConfig?.env) {
    provision = {
      ...provision,
      env: buildProvisionEnvFromInstallConfig(legacyInstallConfig.env),
    }
  }

  const installEnv = buildInstallEnvForSync(legacyInstallConfig, provisionConfig ?? null)

  return {
    name: appConfig?.name,
    handle: appConfig?.handle,
    description: appConfig?.description,
    tools,
    ...(webhooks.length > 0 ? { webhooks } : {}),
    ...(provision ? { provision } : {}),
    ...(installEnv ? { install: { env: installEnv } } : {}),
    syncedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry Path Detection
// ─────────────────────────────────────────────────────────────────────────────

// Check source files first (for dev), then compiled output
const REGISTRY_PATHS = [
  // Source files (dev mode)
  'src/registries.ts',
  'src/registry.ts',
  'src/registries.js',
  'src/registry.js',
  'src/index.ts',
  'src/index.js',
  // Compiled output (production)
  'dist/registries.js',
  'dist/registry.js',
  'dist/index.js',
  'build/registries.js',
  'build/registry.js',
  'build/index.js',
]

export function findRegistryPath(projectDir?: string): string | null {
  const dir = projectDir ?? process.cwd()

  for (const registryPath of REGISTRY_PATHS) {
    const fullPath = path.join(dir, registryPath)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }

  return null
}
