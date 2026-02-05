import { parseArgs } from '../../utils'
import { getCredentials, clearCredentials } from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth logout - Log out from Skedyul

Usage:
  skedyul auth logout [options]

Options:
  --help, -h    Show this help message

This command clears your stored credentials from ~/.skedyul/credentials.json
`)
}

export async function logoutCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const credentials = getCredentials()

  if (!credentials) {
    console.log('Not logged in.')
    return
  }

  clearCredentials()
  console.log(`✓ Logged out from ${credentials.email}`)
  console.log(`  Credentials removed from ~/.skedyul/credentials.json`)
}
