import { loginCommand } from './login'
import { logoutCommand } from './logout'
import { statusCommand } from './status'
import { useCommand } from './use'
import { listCommand } from './list'

function printUsage(): void {
  console.log(`
SKEDYUL AUTH - Authentication Commands
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Manage your Skedyul CLI authentication with multiple profiles.

USAGE
  $ skedyul auth <command> [options]

COMMANDS
  login     Authenticate with Skedyul via browser OAuth
  logout    Clear stored credentials (from active or specified profile)
  status    Show current authentication status and linked workplaces
  use       Switch to a different profile
  list      List all saved profiles

PROFILES
  The CLI supports multiple authentication profiles, allowing you to easily
  switch between different environments (local, staging, production).

  Each profile stores:
  • Server URL (e.g., http://localhost:3000, https://admin.skedyul.it)
  • Authentication token
  • User information (email, username)

HOW AUTHENTICATION WORKS
  1. Run 'skedyul auth login --server <url>'
  2. Browser opens to Skedyul login page
  3. After login, you're redirected back to CLI
  4. Credentials saved to ~/.skedyul/profiles.json
  5. Profile is auto-named based on server (local, staging, production)

EXAMPLES
  # Login to production (creates "production" profile)
  $ skedyul auth login

  # Login to local dev (creates "local" profile)
  $ skedyul auth login --server http://localhost:3000

  # Login with custom profile name
  $ skedyul auth login --server http://localhost:3000 --profile my-local

  # List all profiles
  $ skedyul auth list

  # Switch between profiles
  $ skedyul auth use local
  $ skedyul auth use production

  # Check current status
  $ skedyul auth status

  # Logout from specific profile
  $ skedyul auth logout --profile local

  # Logout from all profiles
  $ skedyul auth logout --all

CREDENTIAL STORAGE
  Profiles:  ~/.skedyul/profiles.json
  Config:    ~/.skedyul/config.json

  Credentials are stored with restrictive permissions (600).
`)
}

export async function authCommand(args: string[]): Promise<void> {
  const subCommand = args[0]

  if (!subCommand || subCommand === '--help' || subCommand === '-h') {
    printUsage()
    return
  }

  const subArgs = args.slice(1)

  switch (subCommand) {
    case 'login':
      await loginCommand(subArgs)
      break
    case 'logout':
      await logoutCommand(subArgs)
      break
    case 'status':
      await statusCommand(subArgs)
      break
    case 'use':
      await useCommand(subArgs)
      break
    case 'list':
      await listCommand(subArgs)
      break
    default:
      console.error(`Unknown auth command: ${subCommand}`)
      console.error(`Run 'skedyul auth --help' for usage information.`)
      process.exit(1)
  }
}
