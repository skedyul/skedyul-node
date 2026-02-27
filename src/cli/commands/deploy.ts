import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { parseArgs } from '../utils'
import { getCredentials, getServerUrl } from '../utils/auth'
import {
  loadConfig,
  validateConfig,
  CONFIG_FILE_NAMES,
  type SkedyulConfig,
} from '../../config'

function printHelp(): void {
  console.log(`
skedyul dev deploy - Deploy your app to Skedyul

Usage:
  skedyul dev deploy [options]

Options:
  --config, -c        Path to config file (default: auto-detect skedyul.config.ts)
  --workplace, -w     Workplace subdomain to deploy to
  --yes, -y           Auto-approve all prompts (skip interactive approval)
  --dry-run           Show what would be deployed without making changes
  --json              Output as JSON
  --help, -h          Show this help message

Description:
  Deploys your app configuration to Skedyul. If the deployment includes
  destructive CRM schema changes (deleting models, fields, or relationships
  with existing data), you will be prompted to approve before proceeding.

Examples:
  # Deploy to linked workplace
  skedyul dev deploy --workplace demo-clinic

  # Deploy with auto-approval (use with caution)
  skedyul dev deploy --workplace demo-clinic --yes

  # Preview deployment without making changes
  skedyul dev deploy --workplace demo-clinic --dry-run
`)
}

interface DeploymentImpact {
  operationType: string
  resourceType: string
  resourceHandle: string
  affectedRecords?: number
  message?: string
  isDestructive: boolean
}

interface DeploymentResult {
  success: boolean
  migrationId?: string
  requiresApproval: boolean
  impacts: DeploymentImpact[]
  error?: string
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

async function promptForApproval(impacts: DeploymentImpact[]): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('')
  console.log('⚠️  This deployment includes destructive operations:')
  console.log('')

  const destructiveImpacts = impacts.filter((i) => i.isDestructive)
  for (const impact of destructiveImpacts) {
    const recordInfo = impact.affectedRecords
      ? ` (${impact.affectedRecords.toLocaleString()} records affected)`
      : ''
    console.log(`  • ${impact.operationType.replace(/_/g, ' ')}: ${impact.resourceHandle || impact.resourceType}${recordInfo}`)
    if (impact.message) {
      console.log(`    ${impact.message}`)
    }
  }

  console.log('')
  console.log('These changes cannot be undone. Data will be permanently deleted.')
  console.log('')

  return new Promise((resolve) => {
    rl.question('Do you want to proceed? (yes/no): ', (answer) => {
      rl.close()
      const normalized = answer.toLowerCase().trim()
      resolve(normalized === 'yes' || normalized === 'y')
    })
  })
}

async function waitForMigrationApproval(
  serverUrl: string,
  token: string,
  migrationId: string,
  timeoutMs: number = 30 * 60 * 1000,
): Promise<{ approved: boolean; timedOut: boolean }> {
  const startTime = Date.now()
  const pollInterval = 5000

  console.log('')
  console.log('⏳ Waiting for migration approval in the Skedyul UI...')
  console.log(`   Migration ID: ${migrationId}`)
  console.log('   (Press Ctrl+C to cancel)')
  console.log('')

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${serverUrl}/api/cli/migration-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ migrationId }),
      })

      if (!response.ok) {
        throw new Error(`Failed to check migration status: ${response.statusText}`)
      }

      const data = await response.json() as { status: string }

      if (data.status === 'APPROVED' || data.status === 'COMPLETED') {
        return { approved: true, timedOut: false }
      }

      if (data.status === 'DENIED' || data.status === 'CANCELLED') {
        return { approved: false, timedOut: false }
      }

      // Still pending, wait and poll again
      const remaining = Math.ceil((timeoutMs - (Date.now() - startTime)) / 60000)
      process.stdout.write(`\r   Status: ${data.status} | Time remaining: ${remaining} minutes   `)
    } catch {
      // Ignore polling errors, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  return { approved: false, timedOut: true }
}

export async function deployCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const jsonOutput = Boolean(flags.json)
  const dryRun = Boolean(flags['dry-run'])
  const autoApprove = Boolean(flags.yes || flags.y)
  const workplace = (flags.workplace || flags.w) as string | undefined

  if (!workplace) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Workplace is required' }))
    } else {
      console.error('❌ Workplace is required')
      console.error('   Use --workplace <subdomain> to specify the target workplace')
    }
    process.exit(1)
  }

  // Get auth token
  const credentials = getCredentials()
  if (!credentials?.token) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Not authenticated' }))
    } else {
      console.error('❌ Not authenticated')
      console.error('   Run: skedyul auth login')
    }
    process.exit(1)
  }

  const token = credentials.token
  const serverUrl = getServerUrl()

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

  if (!jsonOutput) {
    console.log('')
    console.log(`📦 Deploying ${config.name}${config.version ? ` v${config.version}` : ''}`)
    console.log(`   to ${workplace}`)
    console.log('')
  }

  // Send deployment request
  try {
    const response = await fetch(`${serverUrl}/api/cli/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workplace,
        config,
        dryRun,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Deployment failed: ${response.statusText}`)
    }

    const result = await response.json() as DeploymentResult

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (dryRun) {
      console.log('🔍 Dry run - no changes made')
      console.log('')

      if (result.impacts.length === 0) {
        console.log('✅ No schema changes detected')
      } else {
        console.log('Schema changes that would be applied:')
        for (const impact of result.impacts) {
          const prefix = impact.isDestructive ? '⚠️ ' : '  '
          const recordInfo = impact.affectedRecords
            ? ` (${impact.affectedRecords.toLocaleString()} records)`
            : ''
          console.log(`${prefix}${impact.operationType.replace(/_/g, ' ')}: ${impact.resourceHandle || impact.resourceType}${recordInfo}`)
        }
      }
      return
    }

    // Handle approval flow
    if (result.requiresApproval) {
      if (autoApprove) {
        // Auto-approve via CLI
        const approved = await promptForApproval(result.impacts)
        if (!approved) {
          console.log('')
          console.log('❌ Deployment cancelled')
          process.exit(1)
        }

        // Send approval
        const approvalResponse = await fetch(`${serverUrl}/api/cli/approve-migration`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ migrationId: result.migrationId }),
        })

        if (!approvalResponse.ok) {
          throw new Error('Failed to approve migration')
        }

        console.log('')
        console.log('✅ Migration approved')
      } else {
        // Wait for UI approval
        const { approved, timedOut } = await waitForMigrationApproval(
          serverUrl,
          token,
          result.migrationId!,
        )

        console.log('')

        if (timedOut) {
          console.log('⏰ Migration approval timed out')
          console.log('   The migration has been automatically denied.')
          process.exit(1)
        }

        if (!approved) {
          console.log('❌ Migration was denied')
          process.exit(1)
        }

        console.log('✅ Migration approved')
      }
    }

    console.log('')
    console.log('✅ Deployment successful!')
    if (result.migrationId) {
      console.log(`   Migration ID: ${result.migrationId}`)
    }
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`❌ Deployment failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}
