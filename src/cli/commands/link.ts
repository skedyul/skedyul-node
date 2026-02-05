import { parseArgs } from '../utils'
import {
  getCredentials,
  callCliApi,
  getServerUrl,
} from '../utils/auth'
import { loadAppConfig } from '../utils/config'
import { saveLinkConfig, getLinkConfig } from '../utils/link'
import type { LinkConfig } from '../utils/link'

function printHelp(): void {
  console.log(`
skedyul dev link - Link project to a Skedyul workplace

Usage:
  skedyul dev link --workplace <subdomain> [options]

Options:
  --workplace, -w   Workplace subdomain to link to (required)
  --server, -s      Skedyul server URL (overrides default)
  --help, -h        Show this help message

Description:
  Links the current project to a Skedyul workplace for local development.
  This creates a per-developer AppVersion (local-{username}) and an
  AppInstallation for the specified workplace.

Prerequisites:
  - Run 'skedyul auth login' first
  - Project must have a skedyul.config.ts file

Examples:
  # Link to demo-clinic workplace
  skedyul dev link --workplace demo-clinic

  # Link using shorthand
  skedyul dev link -w demo-clinic
`)
}

interface LinkResponse {
  appId: string
  appHandle: string
  appVersionId: string
  appVersionHandle: string
  appInstallationId: string
  workplaceId: string
  workplaceSubdomain: string
  isNewVersion: boolean
  isNewInstallation: boolean
}

export async function linkCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  // Get workplace subdomain
  const workplaceSubdomain = (flags.workplace || flags.w) as string | undefined

  if (!workplaceSubdomain) {
    console.error('Error: --workplace is required')
    console.error("Run 'skedyul dev link --help' for usage information.")
    process.exit(1)
  }

  // Check authentication
  const credentials = getCredentials()
  if (!credentials) {
    console.error('Error: Not logged in.')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }

  // Load skedyul.config
  console.log('Reading skedyul.config...')
  const config = await loadAppConfig()

  if (!config) {
    console.error('Error: No skedyul.config.ts found in current directory.')
    console.error('Make sure you are in a Skedyul app directory.')
    process.exit(1)
  }

  console.log(`  App: ${config.handle}`)

  // Check if already linked
  const existingLink = getLinkConfig(workplaceSubdomain)
  if (existingLink) {
    console.log(`\nAlready linked to ${workplaceSubdomain}`)
    console.log(`  AppVersion: ${existingLink.appVersionHandle}`)
    console.log(`  Installation: ${existingLink.appInstallationId}`)
    console.log(`\nTo re-link, first run 'skedyul dev unlink --workplace ${workplaceSubdomain}'`)
    return
  }

  // Get server URL
  const serverUrl = getServerUrl((flags.server || flags.s) as string | undefined)

  console.log(`\nLinking to ${workplaceSubdomain}...`)

  try {
    const response = await callCliApi<LinkResponse>(
      { serverUrl, token: credentials.token },
      '/link',
      {
        appHandle: config.handle,
        workplaceSubdomain,
      },
    )

    // Save link config
    const linkConfig: LinkConfig = {
      appId: response.appId,
      appHandle: response.appHandle,
      appVersionId: response.appVersionId,
      appVersionHandle: response.appVersionHandle,
      appInstallationId: response.appInstallationId,
      workplaceId: response.workplaceId,
      workplaceSubdomain: response.workplaceSubdomain,
      createdAt: new Date().toISOString(),
      serverUrl,
    }

    saveLinkConfig(linkConfig)

    // Print results
    if (response.isNewVersion) {
      console.log(`  ✓ Created new AppVersion: ${response.appVersionHandle}`)
    } else {
      console.log(`  ✓ Using existing AppVersion: ${response.appVersionHandle}`)
    }

    if (response.isNewInstallation) {
      console.log(`  ✓ Created new AppInstallation`)
    } else {
      console.log(`  ✓ Using existing AppInstallation`)
    }

    console.log(`\nLink saved to .skedyul/links/${workplaceSubdomain}.json`)
    console.log(`\nNext steps:`)
    console.log(`  1. Run 'skedyul dev install --workplace ${workplaceSubdomain}' to configure env vars`)
    console.log(`  2. Run 'skedyul dev serve --linked --workplace ${workplaceSubdomain}' to start testing`)
  } catch (error) {
    console.error(
      `\nFailed to link: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
