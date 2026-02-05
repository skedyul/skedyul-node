import { parseArgs } from '../../utils'
import {
  getCredentials,
  saveCredentials,
  startOAuthCallback,
  getServerUrl,
  saveConfig,
} from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth login - Authenticate with Skedyul

Usage:
  skedyul auth login [options]

Options:
  --server, -s      Skedyul server URL (default: https://app.skedyul.com)
  --help, -h        Show this help message

Examples:
  # Login to production Skedyul
  skedyul auth login

  # Login to a local Skedyul instance
  skedyul auth login --server http://localhost:3000
`)
}

export async function loginCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  // Check if already logged in
  const existingCredentials = getCredentials()
  if (existingCredentials) {
    console.log(`Already logged in as ${existingCredentials.email}`)
    console.log(`Server: ${existingCredentials.serverUrl}`)
    console.log(`\nRun 'skedyul auth logout' to log out first.`)
    return
  }

  // Get server URL
  const serverUrl = getServerUrl(
    (flags.server || flags.s) as string | undefined,
  )

  console.log(`Authenticating with ${serverUrl}...\n`)

  try {
    const result = await startOAuthCallback(serverUrl)

    // Save credentials
    saveCredentials({
      token: result.token,
      userId: result.userId,
      username: result.username,
      email: result.email,
      serverUrl,
      expiresAt: result.expiresAt,
      createdAt: new Date().toISOString(),
    })

    // Save server as default
    saveConfig({ defaultServer: serverUrl })

    console.log(`\n✓ Logged in as ${result.email}`)
    console.log(`  Username: ${result.username}`)
    console.log(`  Server: ${serverUrl}`)
    console.log(`  Credentials saved to ~/.skedyul/credentials.json`)
  } catch (error) {
    console.error(
      `\nAuthentication failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
