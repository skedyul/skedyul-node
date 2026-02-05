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

    // Extract name using regex (handle might be nested in agents, so prioritize name)
    const nameMatch = content.match(/name\s*:\s*['"`]([^'"`]+)['"`]/)

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

  try {
    // For TypeScript files, we need to use the compiled dist version
    // or use a runtime TypeScript loader
    // For now, try to load from dist first, then fallback to source
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
