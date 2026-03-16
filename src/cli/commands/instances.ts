import { parseArgs, formatJson } from '../utils'
import { getCredentials, getServerUrl, callCliApi } from '../utils/auth'
import { configure, instance, runWithConfig } from '../../core/client'

interface WorkplaceTokenResponse {
  token: string
  expiresAt: string
  workplaceId: string
  workplaceName: string
  workplaceSubdomain: string
}

function printHelp(): void {
  console.log(`
skedyul instances - Manage CRM instances

Usage:
  skedyul instances <command> [options]

Commands:
  list <model>              List instances of a model
  get <model> <id>          Get a single instance by ID
  create <model>            Create a new instance
  update <model> <id>       Update an existing instance
  delete <model> <id>       Delete an instance
  create-many <model>       Create multiple instances from a JSON file
  upsert-many <model>       Upsert multiple instances from a JSON file

Required Options:
  --workplace, -w           Workplace subdomain (required)

Options:
  --data, -d                JSON data for create/update operations
  --file, -f                JSON file path for batch operations
  --filter                  JSON filter for list operations
  --limit                   Maximum number of results (default: 50)
  --page                    Page number for pagination (default: 1)
  --match-field             Field handle to match for upsert operations
  --json                    Output as JSON (default for data operations)
  --help, -h                Show this help message

Examples:
  # List all test_orders
  skedyul instances list test_order --workplace crux

  # List with filter
  skedyul instances list test_order --workplace crux --filter '{"status": "pending"}'

  # Get a single instance
  skedyul instances get test_order ins_xxx --workplace crux

  # Create an instance
  skedyul instances create patient --workplace crux --data '{"name": "John Doe"}'

  # Create with relationship (automatically creates RelationshipRecord)
  skedyul instances create test_order --workplace crux --data '{"patient": "ins_patient_xxx"}'

  # Update an instance
  skedyul instances update test_order ins_xxx --workplace crux --data '{"status": "completed"}'

  # Delete an instance
  skedyul instances delete test_order ins_xxx --workplace crux

  # Batch create from file
  skedyul instances create-many panel_result --workplace crux --file ./data.json

  # Batch upsert with match field
  skedyul instances upsert-many panel_result --workplace crux --file ./data.json --match-field vetnostics_id
`)
}

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

export async function instancesCommand(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)

  if (flags.help || flags.h || positional.length === 0) {
    printHelp()
    return
  }

  const subcommand = positional[0]
  const modelHandle = positional[1]
  const instanceId = positional[2]

  // Get workplace from flags
  const workplaceSubdomain = (flags.workplace || flags.w) as string | undefined

  if (!workplaceSubdomain) {
    console.error('Error: --workplace (-w) is required')
    console.error("Example: skedyul instances list test_order --workplace crux")
    process.exit(1)
  }

  // Check authentication
  const credentials = getCredentials()
  if (!credentials) {
    console.error('Error: Not logged in.')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }

  // Get server URL
  const serverUrl = getServerUrl()

  // Get a workplace token for Core API access
  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(
      workplaceSubdomain,
      serverUrl,
      credentials.token,
    )
  } catch (error) {
    console.error(
      `Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }

  // Configure the client with the workplace token
  configure({
    baseUrl: serverUrl,
    apiToken: workplaceToken.token,
  })

  // Execute the subcommand
  try {
    switch (subcommand) {
      case 'list':
        await handleList(modelHandle, flags)
        break
      case 'get':
        await handleGet(modelHandle, instanceId, flags)
        break
      case 'create':
        await handleCreate(modelHandle, flags)
        break
      case 'update':
        await handleUpdate(modelHandle, instanceId, flags)
        break
      case 'delete':
        await handleDelete(modelHandle, instanceId, flags)
        break
      case 'create-many':
        await handleCreateMany(modelHandle, flags)
        break
      case 'upsert-many':
        await handleUpsertMany(modelHandle, flags)
        break
      default:
        console.error(`Error: Unknown subcommand: ${subcommand}`)
        printHelp()
        process.exit(1)
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}

async function handleList(
  modelHandle: string | undefined,
  flags: Record<string, unknown>,
): Promise<void> {
  if (!modelHandle) {
    console.error('Error: Model handle is required')
    console.error('Usage: skedyul instances list <model> --workplace <subdomain>')
    process.exit(1)
  }

  const filter = flags.filter
    ? JSON.parse(flags.filter as string)
    : undefined
  const limit = flags.limit ? Number(flags.limit) : 50
  const page = flags.page ? Number(flags.page) : 1

  const result = await instance.list(modelHandle, {
    filter,
    limit,
    page,
  })

  console.log(formatJson(result))
}

async function handleGet(
  modelHandle: string | undefined,
  instanceId: string | undefined,
  flags: Record<string, unknown>,
): Promise<void> {
  if (!modelHandle) {
    console.error('Error: Model handle is required')
    console.error('Usage: skedyul instances get <model> <id> --workplace <subdomain>')
    process.exit(1)
  }

  if (!instanceId) {
    console.error('Error: Instance ID is required')
    console.error('Usage: skedyul instances get <model> <id> --workplace <subdomain>')
    process.exit(1)
  }

  const result = await instance.get(modelHandle, instanceId)

  if (!result) {
    console.error(`Instance not found: ${instanceId}`)
    process.exit(1)
  }

  console.log(formatJson(result))
}

async function handleCreate(
  modelHandle: string | undefined,
  flags: Record<string, unknown>,
): Promise<void> {
  if (!modelHandle) {
    console.error('Error: Model handle is required')
    console.error('Usage: skedyul instances create <model> --data \'{"field": "value"}\' --workplace <subdomain>')
    process.exit(1)
  }

  const dataStr = (flags.data || flags.d) as string | undefined
  if (!dataStr) {
    console.error('Error: --data (-d) is required')
    console.error('Usage: skedyul instances create <model> --data \'{"field": "value"}\' --workplace <subdomain>')
    process.exit(1)
  }

  const data = JSON.parse(dataStr)
  const result = await instance.create(modelHandle, data)

  console.log(formatJson(result))
}

async function handleUpdate(
  modelHandle: string | undefined,
  instanceId: string | undefined,
  flags: Record<string, unknown>,
): Promise<void> {
  if (!modelHandle) {
    console.error('Error: Model handle is required')
    console.error('Usage: skedyul instances update <model> <id> --data \'{"field": "value"}\' --workplace <subdomain>')
    process.exit(1)
  }

  if (!instanceId) {
    console.error('Error: Instance ID is required')
    console.error('Usage: skedyul instances update <model> <id> --data \'{"field": "value"}\' --workplace <subdomain>')
    process.exit(1)
  }

  const dataStr = (flags.data || flags.d) as string | undefined
  if (!dataStr) {
    console.error('Error: --data (-d) is required')
    console.error('Usage: skedyul instances update <model> <id> --data \'{"field": "value"}\' --workplace <subdomain>')
    process.exit(1)
  }

  const data = JSON.parse(dataStr)
  const result = await instance.update(modelHandle, instanceId, data)

  console.log(formatJson(result))
}

async function handleDelete(
  modelHandle: string | undefined,
  instanceId: string | undefined,
  flags: Record<string, unknown>,
): Promise<void> {
  if (!modelHandle) {
    console.error('Error: Model handle is required')
    console.error('Usage: skedyul instances delete <model> <id> --workplace <subdomain>')
    process.exit(1)
  }

  if (!instanceId) {
    console.error('Error: Instance ID is required')
    console.error('Usage: skedyul instances delete <model> <id> --workplace <subdomain>')
    process.exit(1)
  }

  const result = await instance.delete(modelHandle, instanceId)

  console.log(formatJson(result))
}

async function handleCreateMany(
  modelHandle: string | undefined,
  flags: Record<string, unknown>,
): Promise<void> {
  if (!modelHandle) {
    console.error('Error: Model handle is required')
    console.error('Usage: skedyul instances create-many <model> --file data.json --workplace <subdomain>')
    process.exit(1)
  }

  const filePath = (flags.file || flags.f) as string | undefined
  if (!filePath) {
    console.error('Error: --file (-f) is required')
    console.error('Usage: skedyul instances create-many <model> --file data.json --workplace <subdomain>')
    process.exit(1)
  }

  const fs = await import('fs')
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const items = JSON.parse(fileContent)

  if (!Array.isArray(items)) {
    console.error('Error: File must contain a JSON array of items')
    process.exit(1)
  }

  const result = await instance.createMany(modelHandle, items)

  console.log(formatJson(result))
}

async function handleUpsertMany(
  modelHandle: string | undefined,
  flags: Record<string, unknown>,
): Promise<void> {
  if (!modelHandle) {
    console.error('Error: Model handle is required')
    console.error('Usage: skedyul instances upsert-many <model> --file data.json --match-field <field> --workplace <subdomain>')
    process.exit(1)
  }

  const filePath = (flags.file || flags.f) as string | undefined
  if (!filePath) {
    console.error('Error: --file (-f) is required')
    console.error('Usage: skedyul instances upsert-many <model> --file data.json --match-field <field> --workplace <subdomain>')
    process.exit(1)
  }

  const matchField = flags['match-field'] as string | undefined
  if (!matchField) {
    console.error('Error: --match-field is required')
    console.error('Usage: skedyul instances upsert-many <model> --file data.json --match-field <field> --workplace <subdomain>')
    process.exit(1)
  }

  const fs = await import('fs')
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const items = JSON.parse(fileContent)

  if (!Array.isArray(items)) {
    console.error('Error: File must contain a JSON array of items')
    process.exit(1)
  }

  const result = await instance.upsertMany(modelHandle, items, matchField)

  console.log(formatJson(result))
}
