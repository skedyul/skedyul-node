import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { SkedyulConfig } from './app-config'

// ─────────────────────────────────────────────────────────────────────────────
// Config Loading Utilities
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_FILE_NAMES = [
  'skedyul.config.ts',
  'skedyul.config.js',
  'skedyul.config.mjs',
  'skedyul.config.cjs',
]

function loadTypeScriptConfigModule(absolutePath: string): SkedyulConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('tsx/cjs')
    delete require.cache[absolutePath]
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require(absolutePath)
    return (module.default ?? module) as SkedyulConfig
  } catch (error) {
    throw new Error(
      `Cannot load TypeScript config: ${absolutePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

async function transpileTypeScript(filePath: string): Promise<string> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const configDir = path.dirname(path.resolve(filePath))

  let transpiled = content
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?\n?/g, '')
    .replace(/import\s+\{\s*defineConfig\s*\}\s+from\s+['"]skedyul['"]\s*;?\n?/g, '')
    .replace(/:\s*SkedyulConfig/g, '')
    .replace(/export\s+default\s+/, 'module.exports = ')
    .replace(/defineConfig\s*\(\s*\{/, '{')
    .replace(/\}\s*\)\s*;?\s*$/, '}')

  // Default import: import pkg from './path'
  transpiled = transpiled.replace(
    /import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]\s*(?:with\s*\{[^}]*\})?/g,
    (_match, varName, relativePath) => {
      const absolutePath = path.resolve(configDir, relativePath)
      return `const ${varName} = require('${absolutePath.replace(/\\/g, '/')}')`
    },
  )

  // Named import: import { APP_EVENTS } from './path'
  transpiled = transpiled.replace(
    /import\s+\{\s*(\w+)\s*\}\s+from\s+['"](\.[^'"]+)['"]\s*;?\n?/g,
    (_match, varName, relativePath) => {
      const absolutePath = path.resolve(configDir, relativePath)
      return `const ${varName} = require('${absolutePath.replace(/\\/g, '/')}').${varName}\n`
    },
  )

  // Replace dynamic imports with null - they're not needed for config extraction
  transpiled = transpiled.replace(/import\s*\(\s*['"][^'"]+['"]\s*\)/g, 'null')

  return transpiled
}

export async function loadConfig(configPath: string): Promise<SkedyulConfig> {
  const absolutePath = path.resolve(configPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`)
  }

  const isTypeScript = absolutePath.endsWith('.ts')

  try {
    if (isTypeScript) {
      // Prefer tsx so configs can import TypeScript modules (e.g. events/catalog.ts)
      try {
        const config = loadTypeScriptConfigModule(absolutePath)
        if (!config || typeof config !== 'object') {
          throw new Error('Config file must export a configuration object')
        }
        if (!config.name || typeof config.name !== 'string') {
          throw new Error('Config must have a "name" property')
        }
        return config
      } catch (tsxError) {
        // Fall back to legacy transpile for minimal configs (json-only imports)
        const transpiled = await transpileTypeScript(absolutePath)
        const tempFile = path.join(os.tmpdir(), `skedyul-config-${Date.now()}.cjs`)
        fs.writeFileSync(tempFile, transpiled)
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const module = require(tempFile)
          const config = module.default || module
          if (!config || typeof config !== 'object') {
            throw new Error('Config file must export a configuration object')
          }
          if (!config.name || typeof config.name !== 'string') {
            throw new Error('Config must have a "name" property')
          }
          return config as SkedyulConfig
        } finally {
          try {
            fs.unlinkSync(tempFile)
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    const module = await import(/* webpackIgnore: true */ absolutePath)
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

export function validateConfig(config: SkedyulConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.name) {
    errors.push('Missing required field: name')
  }

  if (config.computeLayer && !['serverless', 'dedicated'].includes(config.computeLayer)) {
    errors.push(`Invalid computeLayer: ${config.computeLayer}. Must be 'serverless' or 'dedicated'`)
  }

  return { valid: errors.length === 0, errors }
}
