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

  // Convert relative imports to absolute paths so they work from temp directory
  // Match: import X from './path' or import X from '../path'
  // Also handles ESM import attributes: import X from './path' with { type: 'json' }
  transpiled = transpiled.replace(
    /import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]\s*(?:with\s*\{[^}]*\})?/g,
    (match, varName, relativePath) => {
      const absolutePath = path.resolve(configDir, relativePath)
      return `const ${varName} = require('${absolutePath.replace(/\\/g, '/')}')`
    },
  )

  // Replace dynamic imports with null - they're not needed for config extraction
  // Match: import('./path') or import("./path")
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
    let moduleToLoad = absolutePath

    if (isTypeScript) {
      const transpiled = await transpileTypeScript(absolutePath)
      const tempDir = os.tmpdir()
      const tempFile = path.join(tempDir, `skedyul-config-${Date.now()}.cjs`)
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
        try {
          fs.unlinkSync(tempFile)
        } catch {
          // Ignore cleanup errors
        }
      }
    }

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
