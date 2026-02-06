#!/usr/bin/env node

import { invokeCommand } from './commands/invoke'
import { toolsCommand } from './commands/tools'
import { serveCommand } from './commands/serve'
import { validateCommand } from './commands/validate'
import { diffCommand } from './commands/diff'
import { authCommand } from './commands/auth'
import { configCommand } from './commands/config'
import { linkCommand } from './commands/link'
import { unlinkCommand } from './commands/unlink'
import { installCommand } from './commands/install'

const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ███████╗██╗  ██╗███████╗██████╗ ██╗   ██╗██╗   ██╗██╗                     │
│   ██╔════╝██║ ██╔╝██╔════╝██╔══██╗╚██╗ ██╔╝██║   ██║██║                     │
│   ███████╗█████╔╝ █████╗  ██║  ██║ ╚████╔╝ ██║   ██║██║                     │
│   ╚════██║██╔═██╗ ██╔══╝  ██║  ██║  ╚██╔╝  ██║   ██║██║                     │
│   ███████║██║  ██╗███████╗██████╔╝   ██║   ╚██████╔╝███████╗                │
│   ╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝    ╚═╝    ╚═════╝ ╚══════╝                │
│                                                                             │
│   The Skedyul SDK Command Line Interface                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

USAGE
  $ skedyul <command> [options]

COMMANDS
  auth    Authenticate with Skedyul (login, logout, status)
  config  Manage global CLI configuration (ngrok, server URL)
  dev     Development tools for building and testing apps locally

GETTING STARTED
  1. Authenticate with Skedyul:
     $ skedyul auth login

  2. Link your project to a workplace:
     $ skedyul dev link --workplace <subdomain>

  3. Configure environment variables:
     $ skedyul dev install --workplace <subdomain>

  4. Start local development server:
     $ skedyul dev serve --workplace <subdomain>

CONFIGURATION
  Global credentials:     ~/.skedyul/credentials.json
  Global config:          ~/.skedyul/config.json
  Local server override:  .skedyul.local.json (in project root)
  Link configs:           .skedyul/links/<workplace>.json
  Environment vars:       .skedyul/env/<workplace>.env

  To use a local Skedyul server, create .skedyul.local.json:
  {
    "serverUrl": "http://localhost:3000"
  }

MORE HELP
  $ skedyul auth --help      Show authentication commands
  $ skedyul config --help    Show configuration commands
  $ skedyul dev --help       Show development commands
  $ skedyul <cmd> --help     Show help for specific command

DOCUMENTATION
  https://docs.skedyul.com/cli
`)
}

function printDevUsage(): void {
  console.log(`
SKEDYUL DEV - Development Tools
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build and test Skedyul apps locally with real API access.

USAGE
  $ skedyul dev <command> [options]

COMMANDS
  Testing & Debugging
  ───────────────────
  invoke <tool>     Invoke a single tool from your registry
  tools             List all tools in your registry
  serve             Start a local MCP server for testing
  validate          Validate your skedyul.config.ts

  Linked Mode (Sidecar)
  ─────────────────────
  link              Link project to a Skedyul workplace
  unlink            Remove a workplace link
  install           Configure installation environment variables

  Deployment
  ──────────
  diff              Show what would change on deploy

STANDALONE MODE
  Test tools locally without connecting to Skedyul:

  $ skedyul dev serve --registry ./dist/registry.js
  $ skedyul dev invoke my_tool --args '{"key": "value"}'

LINKED MODE (Sidecar)
  Connect to Skedyul for full integration testing with real API access:

  Step 1: Link to a workplace (creates your local-<username> AppVersion)
  $ skedyul dev link --workplace demo-clinic

  Step 2: Configure environment variables for the app
  $ skedyul dev install --workplace demo-clinic

  Step 3: Start server with ngrok tunnel (Skedyul routes calls to you)
  $ skedyul dev serve --workplace demo-clinic

  Now Skedyul will route tool calls to your local machine!

EXAMPLES
  # List tools in your registry
  $ skedyul dev tools --registry ./dist/registry.js

  # Test a tool locally (standalone)
  $ skedyul dev invoke appointment_types_list \\
      --registry ./dist/registry.js \\
      --env PETBOOQZ_API_KEY=xxx

  # Test a tool with linked credentials (real API access)
  $ skedyul dev invoke appointment_types_list \\
      --workplace demo-clinic

  # Start server in standalone mode
  $ skedyul dev serve --port 3001

  # Start server in sidecar mode (with ngrok tunnel)
  $ skedyul dev serve --workplace demo-clinic

  # Use existing ngrok tunnel URL
  $ skedyul dev serve --workplace demo-clinic \\
      --tunnel-url https://abc123.ngrok.io

OPTIONS
  --help, -h    Show help for any command

RUN COMMAND HELP
  $ skedyul dev invoke --help
  $ skedyul dev serve --help
  $ skedyul dev link --help
`)
}

async function main(): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage()
    process.exit(0)
  }

  const command = args[0]

  // Top-level commands
  if (command === 'auth') {
    await authCommand(args.slice(1))
    return
  }

  if (command === 'config') {
    await configCommand(args.slice(1))
    return
  }

  if (command !== 'dev') {
    console.error(`Unknown command: ${command}`)
    console.error(`Run 'skedyul --help' for usage information.`)
    process.exit(1)
  }

  const subCommand = args[1]

  if (!subCommand || subCommand === '--help' || subCommand === '-h') {
    printDevUsage()
    process.exit(0)
  }

  const subArgs = args.slice(2)

  switch (subCommand) {
    case 'invoke':
      await invokeCommand(subArgs)
      break
    case 'tools':
      await toolsCommand(subArgs)
      break
    case 'serve':
      await serveCommand(subArgs)
      break
    case 'validate':
      await validateCommand(subArgs)
      break
    case 'diff':
      await diffCommand(subArgs)
      break
    case 'link':
      await linkCommand(subArgs)
      break
    case 'unlink':
      await unlinkCommand(subArgs)
      break
    case 'install':
      await installCommand(subArgs)
      break
    default:
      console.error(`Unknown dev command: ${subCommand}`)
      console.error(`Run 'skedyul dev --help' for usage information.`)
      process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})

