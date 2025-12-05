import * as fs from 'fs'
import * as path from 'path'
import { parseArgs } from '../utils'
import {
  loadConfig,
  validateConfig,
  CONFIG_FILE_NAMES,
  getRequiredInstallEnvKeys,
  getAllEnvKeys,
} from '../../config'

function printHelp(): void {
  console.log(`
skedyul dev validate - Validate skedyul.config.ts

Usage:
  skedyul dev validate [options]

Options:
  --config, -c        Path to config file (default: auto-detect skedyul.config.ts)
  --verbose, -v       Show detailed validation output
  --json              Output as JSON
  --help, -h          Show this help message

Examples:
  # Validate config in current directory
  skedyul dev validate

  # Validate specific config file
  skedyul dev validate --config ./skedyul.config.ts

  # Verbose output
  skedyul dev validate --verbose
`)
}

interface ValidationResult {
  valid: boolean
  configPath: string
  config?: {
    name: string
    version?: string
    computeLayer?: string
    runtime?: string
    tools?: string
    workflows?: string
    globalEnvKeys: string[]
    installEnvKeys: string[]
    requiredInstallEnvKeys: string[]
    appModels: string[]
  }
  errors: string[]
  warnings: string[]
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

export async function validateCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const verbose = Boolean(flags.verbose || flags.v)
  const jsonOutput = Boolean(flags.json)

  // Find config file
  let configPath: string = (flags.config || flags.c) as string

  if (!configPath) {
    const foundConfig = findConfigFile(process.cwd())
    if (!foundConfig) {
      const result: ValidationResult = {
        valid: false,
        configPath: '',
        errors: [`No config file found. Create one of: ${CONFIG_FILE_NAMES.join(', ')}`],
        warnings: [],
      }

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2))
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
    const result: ValidationResult = {
      valid: false,
      configPath,
      errors: [`Config file not found: ${configPath}`],
      warnings: [],
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.error(`❌ Config file not found: ${configPath}`)
    }
    process.exit(1)
  }

  // Load and validate config
  const warnings: string[] = []

  let config
  try {
    config = await loadConfig(configPath)
  } catch (error) {
    const result: ValidationResult = {
      valid: false,
      configPath,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.error(`❌ Failed to load config: ${result.errors[0]}`)
    }
    process.exit(1)
  }

  // Validate schema
  const validation = validateConfig(config)

  // Check for common issues (warnings)
  if (!config.computeLayer) {
    warnings.push('No computeLayer specified. Will default to "dedicated".')
  }

  if (!config.tools) {
    warnings.push('No tools path specified. Will default to "./src/registry.ts".')
  }

  if (!config.workflows) {
    warnings.push('No workflows path specified. Will default to "./workflows".')
  }

  // Check if tools file exists
  const toolsPath = config.tools || './src/registry.ts'
  const absoluteToolsPath = path.resolve(path.dirname(configPath), toolsPath)
  if (!fs.existsSync(absoluteToolsPath)) {
    // Check for .js variant
    const jsToolsPath = absoluteToolsPath.replace(/\.ts$/, '.js')
    if (!fs.existsSync(jsToolsPath)) {
      warnings.push(`Tools file not found: ${toolsPath}`)
    }
  }

  // Check if workflows directory exists
  const workflowsPath = config.workflows || './workflows'
  const absoluteWorkflowsPath = path.resolve(path.dirname(configPath), workflowsPath)
  if (!fs.existsSync(absoluteWorkflowsPath)) {
    warnings.push(`Workflows directory not found: ${workflowsPath}`)
  }

  const envKeys = getAllEnvKeys(config)
  const requiredInstallKeys = getRequiredInstallEnvKeys(config)

  const result: ValidationResult = {
    valid: validation.valid,
    configPath,
    config: {
      name: config.name,
      version: config.version,
      computeLayer: config.computeLayer,
      runtime: config.runtime,
      tools: config.tools,
      workflows: config.workflows,
      globalEnvKeys: envKeys.global,
      installEnvKeys: envKeys.install,
      requiredInstallEnvKeys: requiredInstallKeys,
      appModels: config.install?.appModels?.map((m) => m.entityHandle) || [],
    },
    errors: validation.errors,
    warnings,
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(validation.valid ? 0 : 1)
  }

  // Human-readable output
  console.log('')
  console.log(`📦 ${config.name}${config.version ? ` v${config.version}` : ''}`)
  console.log(`   ${configPath}`)
  console.log('')

  if (verbose) {
    console.log('Configuration:')
    console.log(`  Compute Layer: ${config.computeLayer || 'dedicated (default)'}`)
    console.log(`  Runtime:       ${config.runtime || 'node-22 (default)'}`)
    console.log(`  Tools:         ${config.tools || './src/registry.ts (default)'}`)
    console.log(`  Workflows:     ${config.workflows || './workflows (default)'}`)
    console.log('')

    if (envKeys.global.length > 0) {
      console.log('Global Environment Variables:')
      for (const key of envKeys.global) {
        const def = config.env?.[key]
        const required = def?.required ? ' (required)' : ''
        const visibility = def?.visibility === 'encrypted' ? ' 🔒' : ''
        console.log(`  ${key}${required}${visibility}`)
        if (def?.label) console.log(`    └─ ${def.label}`)
      }
      console.log('')
    }

    if (envKeys.install.length > 0) {
      console.log('Install Environment Variables:')
      for (const key of envKeys.install) {
        const def = config.install?.env?.[key]
        const required = def?.required ? ' (required)' : ''
        const visibility = def?.visibility === 'encrypted' ? ' 🔒' : ''
        console.log(`  ${key}${required}${visibility}`)
        if (def?.label) console.log(`    └─ ${def.label}`)
      }
      console.log('')
    }

    if (config.install?.appModels && config.install.appModels.length > 0) {
      console.log('App Models:')
      for (const model of config.install.appModels) {
        console.log(`  ${model.entityHandle}: ${model.label}`)
      }
      console.log('')
    }
  }

  // Show errors
  if (validation.errors.length > 0) {
    console.log('❌ Validation Errors:')
    for (const error of validation.errors) {
      console.log(`   • ${error}`)
    }
    console.log('')
  }

  // Show warnings
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:')
    for (const warning of warnings) {
      console.log(`   • ${warning}`)
    }
    console.log('')
  }

  // Final status
  if (validation.valid) {
    console.log('✅ Config is valid')
    if (!verbose) {
      console.log(`   ${envKeys.global.length} global env vars, ${envKeys.install.length} install env vars`)
      if (requiredInstallKeys.length > 0) {
        console.log(`   ${requiredInstallKeys.length} required install vars: ${requiredInstallKeys.join(', ')}`)
      }
    }
  } else {
    console.log('❌ Config has errors')
    process.exit(1)
  }
}

