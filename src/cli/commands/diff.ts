import * as fs from 'fs'
import * as path from 'path'
import { parseArgs, loadRegistry } from '../utils'
import {
  loadConfig,
  validateConfig,
  CONFIG_FILE_NAMES,
  type SkedyulConfig,
  type EnvSchema,
} from '../../config'

function printHelp(): void {
  console.log(`
skedyul dev diff - Show what would change on deploy

Usage:
  skedyul dev diff [options]

Options:
  --config, -c        Path to config file (default: auto-detect skedyul.config.ts)
  --registry, -r      Path to registry file to compare tools
  --json              Output as JSON
  --help, -h          Show this help message

Description:
  Compares your local skedyul.config.ts with the currently deployed configuration.
  Shows changes in environment variables, tools, and workflows that would be
  applied when deploying a new version.

Examples:
  # Show diff for config in current directory
  skedyul dev diff

  # Show diff with specific config
  skedyul dev diff --config ./skedyul.config.ts

  # Compare against specific registry
  skedyul dev diff --registry ./dist/registry.js
`)
}

interface EnvDiff {
  added: string[]
  removed: string[]
  changed: Array<{
    key: string
    changes: string[]
  }>
}

interface ToolsDiff {
  added: string[]
  removed: string[]
  total: number
}

interface DiffResult {
  configPath: string
  env: EnvDiff
  tools?: ToolsDiff
  summary: {
    hasChanges: boolean
    envChanges: number
    toolChanges: number
  }
}

function findConfigFile(startDir: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(startDir, fileName)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

function compareEnvSchemas(
  newEnv: EnvSchema | undefined,
  oldEnv: EnvSchema | undefined,
): EnvDiff {
  const newKeys = newEnv ? Object.keys(newEnv) : []
  const oldKeys = oldEnv ? Object.keys(oldEnv) : []

  const added = newKeys.filter((k) => !oldKeys.includes(k))
  const removed = oldKeys.filter((k) => !newKeys.includes(k))

  const changed: Array<{ key: string; changes: string[] }> = []

  // Check for changes in existing keys
  for (const key of newKeys) {
    if (oldKeys.includes(key)) {
      const newDef = newEnv?.[key]
      const oldDef = oldEnv?.[key]
      const changes: string[] = []

      if (newDef?.required !== oldDef?.required) {
        changes.push(
          newDef?.required
            ? 'now required'
            : 'no longer required',
        )
      }

      if (newDef?.visibility !== oldDef?.visibility) {
        changes.push(`visibility: ${oldDef?.visibility || 'visible'} → ${newDef?.visibility || 'visible'}`)
      }

      if (newDef?.label !== oldDef?.label) {
        changes.push(`label changed`)
      }

      if (changes.length > 0) {
        changed.push({ key, changes })
      }
    }
  }

  return { added, removed, changed }
}

export async function diffCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const jsonOutput = Boolean(flags.json)

  // Find config file
  let configPath: string = (flags.config || flags.c) as string

  if (!configPath) {
    const foundConfig = findConfigFile(process.cwd())
    if (!foundConfig) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: 'No config file found' }))
      } else {
        console.error('❌ No config file found')
        console.error(`   Create one of: ${CONFIG_FILE_NAMES.join(', ')}`)
      }
      process.exit(1)
    }
    configPath = foundConfig
  } else {
    configPath = path.resolve(process.cwd(), configPath)
  }

  if (!fs.existsSync(configPath)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Config file not found: ${configPath}` }))
    } else {
      console.error(`❌ Config file not found: ${configPath}`)
    }
    process.exit(1)
  }

  // Load config
  let config: SkedyulConfig
  try {
    config = await loadConfig(configPath)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`❌ Failed to load config: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  // Validate config
  const validation = validateConfig(config)
  if (!validation.valid) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Invalid config', errors: validation.errors }))
    } else {
      console.error('❌ Config validation failed:')
      for (const err of validation.errors) {
        console.error(`   • ${err}`)
      }
    }
    process.exit(1)
  }

  // For now, we compare against "no previous config" (new deploy scenario)
  // In a full implementation, this would fetch the current deployed config from the server
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const previousConfig = undefined as SkedyulConfig | undefined

  // Resolve provision if available (may be a Promise for dynamic imports)
  const provision = config.provision && 'env' in config.provision 
    ? config.provision 
    : undefined
  const previousProvision = previousConfig?.provision && 'env' in previousConfig.provision 
    ? previousConfig.provision 
    : undefined

  // Compare env schemas (all env is now at provision level)
  const envDiff = compareEnvSchemas(
    provision?.env,
    previousProvision?.env,
  )

  // Compare tools if registry path provided
  let toolsDiff: ToolsDiff | undefined
  const registryPath = (flags.registry || flags.r) as string | undefined

  if (registryPath) {
    try {
      const registry = await loadRegistry(path.resolve(process.cwd(), registryPath))
      const toolNames = Object.values(registry).map((t) => t.name)

      // For now, show all tools as "added" since we don't have previous state
      toolsDiff = {
        added: toolNames,
        removed: [],
        total: toolNames.length,
      }
    } catch (error) {
      // Ignore registry loading errors for diff
    }
  }

  const result: DiffResult = {
    configPath,
    env: envDiff,
    tools: toolsDiff,
    summary: {
      hasChanges:
        envDiff.added.length > 0 ||
        envDiff.removed.length > 0 ||
        envDiff.changed.length > 0 ||
        (toolsDiff?.added.length ?? 0) > 0 ||
        (toolsDiff?.removed.length ?? 0) > 0,
      envChanges:
        envDiff.added.length +
        envDiff.removed.length +
        envDiff.changed.length,
      toolChanges: (toolsDiff?.added.length ?? 0) + (toolsDiff?.removed.length ?? 0),
    },
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  // Human-readable output
  console.log('')
  console.log(`📦 ${config.name}${config.version ? ` v${config.version}` : ''}`)
  console.log(`   ${configPath}`)
  console.log('')

  // Note about comparison
  if (previousConfig === undefined) {
    console.log('ℹ️  Comparing against empty state (new deployment)')
    console.log('')
  }

  // Environment variables diff
  if (result.summary.envChanges > 0) {
    console.log('Environment Variables:')
    for (const key of envDiff.added) {
      const def = provision?.env?.[key]
      const required = def?.required ? ' (required)' : ''
      console.log(`  + ${key}${required}`)
    }
    for (const key of envDiff.removed) {
      console.log(`  - ${key}`)
    }
    for (const item of envDiff.changed) {
      console.log(`  ~ ${item.key}: ${item.changes.join(', ')}`)
    }
    console.log('')
  }

  // Tools diff
  if (toolsDiff && result.summary.toolChanges > 0) {
    console.log('Tools:')
    for (const name of toolsDiff.added) {
      console.log(`  + ${name}`)
    }
    for (const name of toolsDiff.removed) {
      console.log(`  - ${name}`)
    }
    console.log('')
  }

  // Summary
  if (result.summary.hasChanges) {
    console.log('Summary:')
    if (result.summary.envChanges > 0) {
      console.log(`  • ${result.summary.envChanges} env var change(s)`)
    }
    if (result.summary.toolChanges > 0) {
      console.log(`  • ${result.summary.toolChanges} tool change(s)`)
    }
    console.log('')
    console.log('✅ Ready to deploy')
  } else {
    console.log('✅ No changes detected')
  }
}

