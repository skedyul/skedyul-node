import * as fs from 'fs'
import * as path from 'path'

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
    onInstall?: unknown
    onUninstall?: unknown
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
      const handleMatch = content.match(/^\s*handle\s*:\s*['"`]([^'"`]+)['"`]/m)
      handle = handleMatch?.[1] ?? null
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

export interface InstallEnvField {
  label: string
  required?: boolean
  visibility?: 'visible' | 'encrypted'
  placeholder?: string
  description?: string
}

export interface InstallConfigData {
  env?: Record<string, InstallEnvField>
  onInstall?: string
  onUninstall?: string
}

export async function loadInstallConfig(
  projectDir?: string,
  debug = false,
): Promise<InstallConfigData | null> {
  const dir = projectDir ?? process.cwd()

  if (debug) console.log(`[loadInstallConfig] Looking in: ${dir}`)

  for (const configPath of INSTALL_CONFIG_PATHS) {
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

/**
 * Parse install config from TypeScript source when dynamic import fails.
 * This is a fallback that extracts env vars using regex.
 */
function parseInstallConfigFromSource(content: string): InstallConfigData | null {
  try {
    const envVars: Record<string, InstallEnvField> = {}

    // Match env block: env: { ... } - need to handle nested braces
    const envStartMatch = content.match(/\benv\s*:\s*\{/)
    if (!envStartMatch || envStartMatch.index === undefined) {
      return null
    }

    // Find the matching closing brace
    const startIdx = envStartMatch.index + envStartMatch[0].length
    let braceCount = 1
    let endIdx = startIdx

    for (let i = startIdx; i < content.length && braceCount > 0; i++) {
      if (content[i] === '{') braceCount++
      else if (content[i] === '}') braceCount--
      endIdx = i
    }

    const envBlock = content.substring(startIdx, endIdx)

    // Match individual env var definitions using a more robust approach
    // Look for UPPER_CASE_VAR: { followed by content until matching }
    const varStartPattern = /([A-Z][A-Z0-9_]*)\s*:\s*\{/g
    let varMatch

    while ((varMatch = varStartPattern.exec(envBlock)) !== null) {
      const varName = varMatch[1]
      const varStartIdx = varMatch.index + varMatch[0].length

      // Find matching closing brace for this var
      let varBraceCount = 1
      let varEndIdx = varStartIdx

      for (let i = varStartIdx; i < envBlock.length && varBraceCount > 0; i++) {
        if (envBlock[i] === '{') varBraceCount++
        else if (envBlock[i] === '}') varBraceCount--
        varEndIdx = i
      }

      const varContent = envBlock.substring(varStartIdx, varEndIdx)

      const field: InstallEnvField = { label: varName }

      // Extract label
      const labelMatch = varContent.match(/label\s*:\s*['"`]([^'"`]+)['"`]/)
      if (labelMatch) field.label = labelMatch[1]

      // Extract required
      const requiredMatch = varContent.match(/required\s*:\s*(true|false)/)
      if (requiredMatch) field.required = requiredMatch[1] === 'true'

      // Extract visibility
      const visibilityMatch = varContent.match(/visibility\s*:\s*['"`](visible|encrypted)['"`]/)
      if (visibilityMatch) field.visibility = visibilityMatch[1] as 'visible' | 'encrypted'

      // Extract placeholder
      const placeholderMatch = varContent.match(/placeholder\s*:\s*['"`]([^'"`]+)['"`]/)
      if (placeholderMatch) field.placeholder = placeholderMatch[1]

      // Extract description (handle multi-line strings)
      const descMatch = varContent.match(/description\s*:\s*['"`]([^'"`]+)['"`]/)
      if (descMatch) field.description = descMatch[1]

      envVars[varName] = field
    }

    if (Object.keys(envVars).length === 0) {
      return null
    }

    return { env: envVars }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Install Handler Loading
// ─────────────────────────────────────────────────────────────────────────────

const INSTALL_HANDLER_PATHS = [
  // Source files (dev mode)
  'src/install.ts',
  'src/install.js',
  // Compiled output (production)
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
