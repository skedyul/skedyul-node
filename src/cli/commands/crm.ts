import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { parseArgs, formatJson } from '../utils'
import { getCredentials, getServerUrl, callCliApi } from '../utils/auth'
import {
  loadSchema,
  saveSchema,
  transformToBackendSchema,
  transformFromBackendSchema,
  type BackendDesiredSchema,
} from '../../config/schema-loader'
import type { CRMSchema } from '../../schemas/crm-schema'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WorkplaceTokenResponse {
  token: string
  expiresAt: string
  workplaceId: string
  workplaceName: string
  workplaceSubdomain: string
}

interface SchemaImpact {
  operationType: string
  resourceType: string
  resourceHandle: string
  affectedRecords?: number
  message?: string
  isDestructive: boolean
}

interface SchemaDiffResponse {
  success: boolean
  hasChanges: boolean
  impacts: SchemaImpact[]
  error?: string
}

interface SchemaPushResponse {
  success: boolean
  migrationId?: string
  requiresApproval: boolean
  hasChanges?: boolean
  impacts: SchemaImpact[]
  error?: string
}

interface SchemaPullResponse {
  success: boolean
  schema: BackendDesiredSchema
  workplaceName: string
  error?: string
}

interface ModelsListResponse {
  success: boolean
  models: Array<{
    id: string
    handle: string
    name: string
    namePlural?: string
    fieldCount: number
    instanceCount: number
  }>
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
skedyul crm - Manage CRM schemas for workplaces

Usage:
  skedyul crm <command> [options]

Commands:
  push          Push a local schema to a workplace
  pull          Pull the current schema from a workplace
  diff          Preview schema changes without applying
  models        List models in a workplace

Push Options:
  --schema, -s      Path to schema file (.schema.ts or .schema.json)
  --workplace, -w   Workplace subdomain (required)
  --yes, -y         Auto-approve destructive changes
  --dry-run         Preview changes without applying (same as diff)
  --json            Output as JSON

Pull Options:
  --workplace, -w   Workplace subdomain (required)
  --output, -o      Output file path (default: stdout)
  --format, -f      Output format: json or ts (default: json)
  --json            Output as JSON (for stdout)

Diff Options:
  --schema, -s      Path to schema file (.schema.ts or .schema.json)
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Models Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Examples:
  # Push a schema to a workplace
  skedyul crm push --schema ./gym.schema.ts --workplace gym-demo

  # Preview changes before pushing
  skedyul crm diff --schema ./gym.schema.ts --workplace gym-demo

  # Pull current schema from workplace
  skedyul crm pull --workplace gym-demo --output ./current.schema.json

  # Pull as TypeScript
  skedyul crm pull --workplace gym-demo --output ./current.schema.ts --format ts

  # List models in a workplace
  skedyul crm models --workplace gym-demo

  # Auto-approve destructive changes
  skedyul crm push --schema ./gym.schema.ts --workplace gym-demo --yes
`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getWorkplaceToken(
  workplaceSubdomain: string,
  serverUrl: string,
  cliToken: string,
): Promise<WorkplaceTokenResponse> {
  return callCliApi<WorkplaceTokenResponse>(
    { serverUrl, token: cliToken },
    '/workplace-token',
    { workplaceSubdomain },
  )
}

function ensureAuth(): { token: string; serverUrl: string } {
  const credentials = getCredentials()
  if (!credentials?.token) {
    console.error('Error: Not authenticated')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }
  return { token: credentials.token, serverUrl: getServerUrl() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Prompt
// ─────────────────────────────────────────────────────────────────────────────

async function promptForApproval(impacts: SchemaImpact[]): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('')
  console.log('⚠️  This operation includes destructive changes:')
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

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function handlePush(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  const schemaPath = (flags.schema || flags.s) as string | undefined
  const workplace = (flags.workplace || flags.w) as string | undefined
  const autoApprove = Boolean(flags.yes || flags.y)
  const dryRun = Boolean(flags['dry-run'])
  const jsonOutput = Boolean(flags.json)

  if (!schemaPath) {
    console.error('Error: --schema (-s) is required')
    console.error('Usage: skedyul crm push --schema ./gym.schema.ts --workplace gym-demo')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul crm push --schema ./gym.schema.ts --workplace gym-demo')
    process.exit(1)
  }

  // Load and validate schema
  let schema: CRMSchema
  try {
    const result = await loadSchema(schemaPath)
    schema = result.schema
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  // Get auth
  const { token, serverUrl } = ensureAuth()

  // Get workplace token
  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  // Transform to backend format
  const backendSchema = transformToBackendSchema(schema)

  if (!jsonOutput && !dryRun) {
    console.log('')
    console.log(`📦 Pushing schema "${schema.name}" to ${workplace}`)
    console.log('')
  }

  // Send to backend
  try {
    const response = await fetch(`${serverUrl}/api/cli/crm-schema`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workplace,
        workplaceId: workplaceToken.workplaceId,
        schema: backendSchema,
        dryRun,
        autoApprove,
        schemaName: schema.name,
        schemaVersion: schema.version,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as SchemaPushResponse

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (dryRun) {
      console.log('🔍 Dry run - no changes made')
      console.log('')

      if (!result.hasChanges && result.impacts.length === 0) {
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
        const approved = await promptForApproval(result.impacts)
        if (!approved) {
          console.log('')
          console.log('❌ Operation cancelled')
          process.exit(1)
        }

        // Send approval
        const approvalResponse = await fetch(`${serverUrl}/api/cli/crm-schema/approve`, {
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
        console.log('✅ Migration approved and applied')
      } else {
        console.log('')
        console.log('⚠️  This operation requires approval.')
        console.log('   Use --yes to approve destructive changes from the CLI.')
        console.log(`   Migration ID: ${result.migrationId}`)
        process.exit(1)
      }
    } else {
      console.log('✅ Schema pushed successfully!')
      if (result.migrationId) {
        console.log(`   Migration ID: ${result.migrationId}`)
      }
    }
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

async function handlePull(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  const workplace = (flags.workplace || flags.w) as string | undefined
  const outputPath = (flags.output || flags.o) as string | undefined
  const format = (flags.format || flags.f || 'json') as string
  const jsonOutput = Boolean(flags.json)

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul crm pull --workplace gym-demo --output ./current.schema.json')
    process.exit(1)
  }

  // Get auth
  const { token, serverUrl } = ensureAuth()

  // Get workplace token
  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/crm-schema?workplaceId=${workplaceToken.workplaceId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as SchemaPullResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to pull schema')
    }

    // Transform to CRM schema format
    const schema = transformFromBackendSchema(
      result.schema,
      `${result.workplaceName} Schema`,
      `Schema pulled from ${workplace}`,
    )

    if (outputPath) {
      // Determine format from file extension or flag
      const isTypeScript = outputPath.endsWith('.ts') || format === 'ts'
      await saveSchema(schema, outputPath)
      console.log(`✅ Schema saved to ${outputPath}`)
    } else if (jsonOutput || format === 'json') {
      console.log(JSON.stringify(schema, null, 2))
    } else {
      // Pretty print for human consumption
      console.log('')
      console.log(`📦 Schema from ${workplace}`)
      console.log('')
      console.log(`Models (${schema.models.length}):`)
      for (const model of schema.models) {
        console.log(`  • ${model.name} (${model.handle}) - ${model.fields.length} fields`)
      }
      if (schema.relationships && schema.relationships.length > 0) {
        console.log('')
        console.log(`Relationships (${schema.relationships.length}):`)
        for (const rel of schema.relationships) {
          console.log(`  • ${rel.source.model}.${rel.source.field} → ${rel.target.model}.${rel.target.field} (${rel.cardinality})`)
        }
      }
      console.log('')
      console.log('Use --output to save to a file, or --json for full JSON output.')
    }
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

async function handleDiff(args: string[]): Promise<void> {
  // Diff is just push with --dry-run
  await handlePush([...args, '--dry-run'])
}

async function handleModels(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul crm models --workplace gym-demo')
    process.exit(1)
  }

  // Get auth
  const { token, serverUrl } = ensureAuth()

  // Get workplace token
  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/crm-models?workplaceId=${workplaceToken.workplaceId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as ModelsListResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to list models')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result.models, null, 2))
      return
    }

    console.log('')
    console.log(`📦 Models in ${workplace}`)
    console.log('')

    if (result.models.length === 0) {
      console.log('  No models found.')
    } else {
      // Table header
      console.log('  Handle                Label                   Fields  Instances')
      console.log('  ────────────────────  ──────────────────────  ──────  ─────────')

      for (const model of result.models) {
        const handle = model.handle.padEnd(20)
        const label = model.name.padEnd(22)
        const fields = String(model.fieldCount).padStart(6)
        const instances = String(model.instanceCount).padStart(9)
        console.log(`  ${handle}  ${label}  ${fields}  ${instances}`)
      }
    }

    console.log('')
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

export async function crmCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printHelp()
    return
  }

  const subArgs = args.slice(1)

  switch (subcommand) {
    case 'push':
      await handlePush(subArgs)
      break
    case 'pull':
      await handlePull(subArgs)
      break
    case 'diff':
      await handleDiff(subArgs)
      break
    case 'models':
      await handleModels(subArgs)
      break
    default:
      console.error(`Error: Unknown subcommand: ${subcommand}`)
      console.error("Run 'skedyul crm --help' for usage information.")
      process.exit(1)
  }
}
