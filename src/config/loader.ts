import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { SkedyulConfig } from './app-config'
import { transpileConfigMetadata } from './transpileConfigMetadata'

// ─────────────────────────────────────────────────────────────────────────────
// Config Loading Utilities
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_FILE_NAMES = [
  'skedyul.config.ts',
  'skedyul.config.js',
  'skedyul.config.mjs',
  'skedyul.config.cjs',
]

export async function loadConfig(configPath: string): Promise<SkedyulConfig> {
  const absolutePath = path.resolve(configPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`)
  }

  const isTypeScript = absolutePath.endsWith('.ts')

  try {
    if (isTypeScript) {
      // Metadata-only load (build, validate): esbuild transpile + stub dynamic imports.
      // Full tsx load (config:export) executes dynamic import() and can crash the process.
      try {
        const transpiled = await transpileConfigMetadata(absolutePath)
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
      } catch (transpileError) {
        throw new Error(
          `Cannot load TypeScript config metadata from ${absolutePath}: ${
            transpileError instanceof Error ? transpileError.message : String(transpileError)
          }`,
        )
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
