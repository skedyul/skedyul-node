import { parseArgs } from '../utils'
import { getLinkConfig, deleteLinkConfig, deleteEnvFile } from '../utils/link'

function printHelp(): void {
  console.log(`
skedyul dev unlink - Remove a workplace link

Usage:
  skedyul dev unlink --workplace <subdomain> [options]

Options:
  --workplace, -w   Workplace subdomain to unlink (required)
  --help, -h        Show this help message

Description:
  Removes the link between this project and a Skedyul workplace.
  This deletes the local link config and env files.
  Note: The AppInstallation still exists on the server.

Examples:
  skedyul dev unlink --workplace demo-clinic
`)
}

export async function unlinkCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const workplaceSubdomain = (flags.workplace || flags.w) as string | undefined

  if (!workplaceSubdomain) {
    console.error('Error: --workplace is required')
    console.error("Run 'skedyul dev unlink --help' for usage information.")
    process.exit(1)
  }

  // Check if linked
  const linkConfig = getLinkConfig(workplaceSubdomain)
  if (!linkConfig) {
    console.log(`Not linked to ${workplaceSubdomain}`)
    return
  }

  // Delete link config
  deleteLinkConfig(workplaceSubdomain)
  console.log(`✓ Removed link to ${workplaceSubdomain}`)

  // Delete env file if it exists
  if (deleteEnvFile(workplaceSubdomain)) {
    console.log(`✓ Removed env file for ${workplaceSubdomain}`)
  }

  console.log(`\nNote: AppInstallation still exists on server.`)
}
