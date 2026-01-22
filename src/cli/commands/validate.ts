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
    /** Tools type: 'dynamic-import' if using import() */
    tools?: 'dynamic-import' | 'object'
    envKeys: string[]
    modelHandles: string[]
    channelHandles: string[]
    workflowCount: number
    pageCount: number
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
    warnings.push('No tools specified.')
  }

  // Resolve provision if available (may be a Promise for dynamic imports)
  const provision = config.provision && 'env' in config.provision 
    ? config.provision 
    : undefined

  // Check if tools is a dynamic import
  const toolsConfig = config.tools
  const isToolsDynamicImport = toolsConfig !== undefined && typeof toolsConfig !== 'string'

  // Check workflow files exist (provision.workflows contains workflow definitions with paths)
  if (provision?.workflows) {
    for (const workflow of provision.workflows) {
      if (workflow.path) {
        const absoluteWorkflowPath = path.resolve(path.dirname(configPath), workflow.path)
        if (!fs.existsSync(absoluteWorkflowPath)) {
          warnings.push(`Workflow file not found: ${workflow.path}`)
        }
      }
    }
  }

  const envKeys = getAllEnvKeys(config)

  const result: ValidationResult = {
    valid: validation.valid,
    configPath,
    config: {
      name: config.name,
      version: config.version,
      computeLayer: config.computeLayer,
      tools: isToolsDynamicImport ? 'dynamic-import' : (toolsConfig ? 'object' : undefined),
      envKeys: envKeys.global,
      modelHandles: provision?.models?.map((m) => m.handle) || [],
      channelHandles: provision?.channels?.map((c) => c.handle) || [],
      workflowCount: provision?.workflows?.length || 0,
      pageCount: provision?.pages?.length || 0,
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
    const toolsDisplay = isToolsDynamicImport 
      ? 'dynamic import (import())' 
      : (toolsConfig || './src/registry.ts (default)')
    
    // Resolve provision if available (may be a Promise for dynamic imports)
    const provision = config.provision && 'env' in config.provision 
      ? config.provision 
      : undefined
    
    console.log('Configuration:')
    console.log(`  Compute Layer: ${config.computeLayer || 'dedicated (default)'}`)
    console.log(`  Tools:         ${toolsDisplay}`)
    console.log(`  Workflows:     ${provision?.workflows?.length || 0} workflows`)
    console.log('')

    if (envKeys.global.length > 0) {
      console.log('Environment Variables:')
      for (const key of envKeys.global) {
        const def = provision?.env?.[key]
        const required = def?.required ? ' (required)' : ''
        const visibility = def?.visibility === 'encrypted' ? ' 🔒' : ''
        console.log(`  ${key}${required}${visibility}`)
        if (def?.label) console.log(`    └─ ${def.label}`)
      }
      console.log('')
    }

    if (provision?.models && provision.models.length > 0) {
      console.log('Models:')
      for (const model of provision.models) {
        console.log(`  ${model.handle}: ${model.name} (${model.scope})`)
      }
      console.log('')
    }

    if (provision?.channels && provision.channels.length > 0) {
      console.log('Channels:')
      for (const channel of provision.channels) {
        console.log(`  ${channel.handle}: ${channel.name}`)
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
      const modelCount = provision?.models?.length || 0
      const channelCount = provision?.channels?.length || 0
      const workflowCount = provision?.workflows?.length || 0
      console.log(`   ${envKeys.global.length} env vars, ${modelCount} models, ${channelCount} channels, ${workflowCount} workflows`)
    }
  } else {
    console.log('❌ Config has errors')
    process.exit(1)
  }
}

