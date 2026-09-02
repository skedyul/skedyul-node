import { parseArgs, formatJson } from '../utils'
import { getCredentials, getServerUrl } from '../utils/auth'
import { getDeployment, type CliContext } from '../api'

function printHelp(): void {
  console.log(`
skedyul apps - Inspect app installations and deployments

Usage:
  skedyul apps deployment --id <deploymentId> [options]

Required:
  --id, -i                  Deployment ID (dpl_...)

Options:
  --tail, -n                Newest log lines (default: 100, max: 500)
  --errors-only             Only print error/warn lines
  --no-logs                 Skip the log tail (FAILED still returns errors)
  --json                    Output the full JSON response
  --help, -h                Show this help message

Examples:
  skedyul apps deployment --id dpl_abc123
  skedyul apps deployment --id dpl_abc123 --errors-only
  skedyul apps deployment --id dpl_abc123 --tail 200 --json

MCP equivalent: apps_get_deployment
`)
}

function formatLogLine(entry: {
  timestamp?: string
  level?: string
  message?: string
}): string {
  const time = entry.timestamp ?? ''
  const level = (entry.level ?? 'info').toUpperCase().padEnd(5)
  const message = entry.message ?? ''
  return [time, level, message].filter(Boolean).join('  ')
}

export async function appsCommand(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const subcommand = positional[0]
  if (subcommand !== 'deployment') {
    printHelp()
    process.exit(subcommand ? 1 : 0)
  }

  const deploymentId = String(flags.id ?? flags.i ?? positional[1] ?? '')
  if (!deploymentId) {
    console.error('Error: --id <deploymentId> is required')
    printHelp()
    process.exit(1)
  }

  const credentials = getCredentials()
  if (!credentials?.token) {
    console.error("Not logged in. Run 'skedyul auth login' first.")
    process.exit(1)
  }

  const ctx: CliContext = {
    token: credentials.token,
    serverUrl: credentials.serverUrl || getServerUrl(),
  }

  const tailFlag = flags.tail ?? flags.n
  const tail =
    typeof tailFlag === 'string' && tailFlag.length > 0
      ? Number(tailFlag)
      : undefined

  const result = await getDeployment(ctx, {
    deploymentId,
    tail: Number.isFinite(tail) ? tail : undefined,
    includeLogs: flags['no-logs'] ? false : true,
    errorsOnly: Boolean(flags['errors-only']),
  })

  if (flags.json) {
    console.log(formatJson(result))
    if (result.error && !result.deploymentId) {
      process.exit(1)
    }
    return
  }

  if (result.error && !result.deploymentId) {
    console.error(result.error)
    process.exit(1)
  }

  console.log(`Deployment  ${result.deploymentId ?? deploymentId}`)
  console.log(`Status      ${result.status ?? 'unknown'}`)
  if (result.appHandle) {
    console.log(`App         ${result.appHandle}`)
  }
  if (result.readyToInvoke != null) {
    console.log(`Ready       ${result.readyToInvoke ? 'yes' : 'no'}`)
  }
  if (result.invokeEndpoint) {
    console.log(`Endpoint    ${result.invokeEndpoint}`)
  }
  if (result.provision?.status) {
    console.log(
      `Provision   ${result.provision.status}${
        result.provision.currentStep ? ` (${result.provision.currentStep})` : ''
      }`,
    )
  }
  if (result.provision?.errorMessage) {
    console.error(`Provision error: ${result.provision.errorMessage}`)
  }
  if (result.pendingMigration) {
    console.error(
      'Pending CRM migration — approve it in Skedyul or via crm.approveMigration before the deploy can finish.',
    )
  }
  if (result.lastError) {
    console.error(`Queue error: ${result.lastError}`)
  }
  if (result.hint) {
    console.error(result.hint)
  }
  if (result.logsError) {
    console.error(`Log fetch: ${result.logsError}`)
  }

  const errors = result.errors ?? []
  if (errors.length > 0) {
    console.log('')
    console.log(`Errors (${errors.length})`)
    for (const entry of errors) {
      console.error(formatLogLine(entry))
    }
  }

  const logs = result.logs ?? []
  if (logs.length > 0 && !flags['errors-only']) {
    const total = result.logsTotal ?? logs.length
    const label = result.logsTruncated
      ? `Logs (newest ${logs.length} of ${total})`
      : `Logs (${logs.length})`
    console.log('')
    console.log(label)
    for (const entry of logs) {
      console.log(formatLogLine(entry))
    }
  }
}
