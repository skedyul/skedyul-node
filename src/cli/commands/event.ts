import { parseArgs, formatJson } from '../utils'
import { getCredentials, getServerUrl, callCliApi } from '../utils/auth'
import { configure, event, runWithConfig } from '../../core/client'

interface WorkplaceTokenResponse {
  token: string
  expiresAt: string
  workplaceId: string
  workplaceName: string
  workplaceSubdomain: string
}

function printHelp(): void {
  console.log(`
skedyul event - Emit test app events to the event bus

Usage:
  skedyul event create <name> [data] [options]

Required:
  <name>                    Event name (e.g. customer.sync)
  --workplace, -w           Workplace subdomain

Options:
  --data, -d                JSON payload (default: {})
  --app, -a                 App handle namespace (default: cli)
                            Event type becomes app.{app}.{name}
  --context, -c             JSON context metadata (optional)
  --json                    Output full JSON response
  --help, -h                Show this help message

Examples:
  # Emit with inline JSON payload
  skedyul event create customer.sync '{"customers":[{"id":1}]}' -w demo-clinic

  # Emit with --data flag
  skedyul event create order.created -w demo-clinic \\
    --data '{"order":{"id":123,"email":"test@example.com"}}'

  # Use a specific app namespace (matches production event types)
  skedyul event create customer.sync '{"customers":[]}' -w demo-clinic --app shopify

  # Empty payload
  skedyul event create ping -w demo-clinic

Notes:
  - Uses your CLI login + workplace membership (no app install required)
  - Event type: app.{app}.{name} (app defaults to "cli")
  - Passthrough when no EventSubscription exists: emitted=false, eventId=null
  - Create EventSubscription rows in the UI to test workflow dispatch
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

function parseJsonObject(
  value: string | undefined,
  label: string,
): Record<string, unknown> {
  if (!value || value.trim() === '') {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`)
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid ${label} JSON: ${message}`)
  }
}

export async function eventCommand(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args)

  if (flags.help || flags.h || positional.length === 0) {
    printHelp()
    return
  }

  const subcommand = positional[0]

  if (subcommand !== 'create') {
    console.error(`Error: Unknown subcommand: ${subcommand}`)
    printHelp()
    process.exit(1)
  }

  const eventName = positional[1]
  const inlineData = positional[2]

  if (!eventName) {
    console.error('Error: Event name is required')
    console.error(
      "Usage: skedyul event create <name> [data] --workplace <subdomain>",
    )
    process.exit(1)
  }

  const workplaceSubdomain = (flags.workplace || flags.w) as string | undefined
  if (!workplaceSubdomain) {
    console.error('Error: --workplace (-w) is required')
    console.error(
      "Example: skedyul event create customer.sync '{}' --workplace demo-clinic",
    )
    process.exit(1)
  }

  const credentials = getCredentials()
  if (!credentials) {
    console.error('Error: Not logged in.')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }

  const serverUrl = getServerUrl()

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

  const dataSource =
    (flags.data as string | undefined) ??
    (flags.d as string | undefined) ??
    inlineData

  let payload: Record<string, unknown>
  try {
    payload = parseJsonObject(dataSource, 'payload')
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }

  const appHandle = (flags.app || flags.a) as string | undefined

  let extraContext: Record<string, unknown> | undefined
  const contextSource = (flags.context || flags.c) as string | undefined
  if (contextSource) {
    try {
      extraContext = parseJsonObject(contextSource, 'context')
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
      process.exit(1)
    }
  }

  const clientConfig = {
    baseUrl: serverUrl,
    apiToken: workplaceToken.token,
  }

  configure(clientConfig)

  try {
    const result = await runWithConfig(clientConfig, () =>
      event.create(eventName, payload, {
        trigger: 'cli',
        app: appHandle,
        context: extraContext,
      }),
    )

    const eventType =
      result.eventType ?? `app.${appHandle ?? 'cli'}.${eventName}`

    if (flags.json) {
      console.log(
        formatJson({
          ...result,
          eventType,
          workplace: workplaceToken.workplaceSubdomain,
        }),
      )
      return
    }

    if (result.emitted) {
      console.log(`Event emitted: ${eventType}`)
      console.log(`Event ID: ${result.eventId}`)
    } else {
      console.log(`Passthrough (no subscription): ${eventType}`)
      console.log(
        `No Event row created. Add an EventSubscription for "${eventType}" to test dispatch.`,
      )
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
