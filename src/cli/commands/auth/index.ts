import { loginCommand } from './login'
import { logoutCommand } from './logout'
import { statusCommand } from './status'

function printUsage(): void {
  console.log(`
SKEDYUL AUTH - Authentication Commands
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Manage your Skedyul CLI authentication.

USAGE
  $ skedyul auth <command> [options]

COMMANDS
  login     Authenticate with Skedyul via browser OAuth
  logout    Clear stored credentials
  status    Show current authentication status and linked workplaces

HOW AUTHENTICATION WORKS
  1. Run 'skedyul auth login'
  2. Browser opens to Skedyul login page
  3. After login, you're redirected back to CLI
  4. Credentials saved to ~/.skedyul/credentials.json

  Your CLI token is used for:
  • Linking projects to workplaces
  • Getting scoped API tokens for tool testing
  • Managing local development environments

EXAMPLES
  # Login to production Skedyul
  $ skedyul auth login

  # Login to a specific server
  $ skedyul auth login --server http://localhost:3000

  # Check authentication status
  $ skedyul auth status

  # Logout and clear credentials
  $ skedyul auth logout

SERVER CONFIGURATION
  Default server: https://admin.skedyul.it

  Override with:
  • --server flag on any command
  • .skedyul.local.json in project root:
    { "serverUrl": "http://localhost:3000" }

CREDENTIAL STORAGE
  Credentials: ~/.skedyul/credentials.json
  Config:      ~/.skedyul/config.json

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
    default:
      console.error(`Unknown auth command: ${subCommand}`)
      console.error(`Run 'skedyul auth --help' for usage information.`)
      process.exit(1)
  }
}
