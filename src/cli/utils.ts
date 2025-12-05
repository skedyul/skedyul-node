import * as fs from 'fs'
import * as path from 'path'
import type { ToolRegistry } from '../types'

export interface ParsedArgs {
  flags: Record<string, string | boolean>
  positional: string[]
}

/**
 * Parse command line arguments into flags and positional args
 */
export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []

  let i = 0
  while (i < args.length) {
    const arg = args[i]

    if (arg.startsWith('--')) {
      const key = arg.slice(2)

      // Check if it's a key=value format
      if (key.includes('=')) {
        const [k, ...vParts] = key.split('=')
        flags[k] = vParts.join('=')
      } else {
        // Check if next arg is the value (not another flag)
        const nextArg = args[i + 1]
        if (nextArg && !nextArg.startsWith('-')) {
          flags[key] = nextArg
          i++
        } else {
          flags[key] = true
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1)
      const nextArg = args[i + 1]
      if (nextArg && !nextArg.startsWith('-')) {
        flags[key] = nextArg
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }

    i++
  }

  return { flags, positional }
}

/**
 * Parse multiple --env flags into a record
 */
export function parseEnvFlags(args: string[]): Record<string, string> {
  const env: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--env' || arg === '-e') {
      const nextArg = args[i + 1]
      if (nextArg && nextArg.includes('=')) {
        const [key, ...valueParts] = nextArg.split('=')
        env[key] = valueParts.join('=')
        i++
      }
    } else if (arg.startsWith('--env=')) {
      const value = arg.slice(6)
      if (value.includes('=')) {
        const [key, ...valueParts] = value.split('=')
        env[key] = valueParts.join('=')
      }
    }
  }

  return env
}

/**
 * Load environment variables from a .env file
 */
export function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}

  const absolutePath = path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Environment file not found: ${absolutePath}`)
  }

  const content = fs.readFileSync(absolutePath, 'utf-8')
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const equalIndex = trimmed.indexOf('=')
    if (equalIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, equalIndex).trim()
    let value = trimmed.slice(equalIndex + 1).trim()

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

/**
 * Load a registry from a JS/TS file
 */
export async function loadRegistry(registryPath: string): Promise<ToolRegistry> {
  const absolutePath = path.resolve(process.cwd(), registryPath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Registry file not found: ${absolutePath}`)
  }

  try {
    // Use dynamic import for ES modules compatibility
    const module = await import(absolutePath)

    // Check for registry export (default or named)
    const registry = module.registry || module.default?.registry || module.default

    if (!registry || typeof registry !== 'object') {
      throw new Error(
        `Registry file must export a 'registry' object. Got: ${typeof registry}`,
      )
    }

    // Validate it looks like a tool registry
    const keys = Object.keys(registry)
    if (keys.length === 0) {
      throw new Error('Registry is empty')
    }

    // Check that at least one entry has expected tool shape
    const firstTool = registry[keys[0]]
    if (!firstTool || typeof firstTool.name !== 'string') {
      throw new Error(
        'Registry entries must have a "name" property. Is this a valid tool registry?',
      )
    }

    return registry as ToolRegistry
  } catch (error) {
    if (error instanceof Error && error.message.includes('Registry')) {
      throw error
    }
    throw new Error(
      `Failed to load registry from ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Format JSON for console output with optional color
 */
export function formatJson(data: unknown, pretty = true): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
}

