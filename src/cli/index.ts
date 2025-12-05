#!/usr/bin/env node

import { invokeCommand } from './commands/invoke'
import { toolsCommand } from './commands/tools'
import { serveCommand } from './commands/serve'

const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
skedyul - Skedyul SDK CLI

Usage:
  skedyul dev <command> [options]

Commands:
  dev invoke <tool>   Invoke a tool from the registry
  dev tools           List all tools in the registry
  dev serve           Start a local MCP server

Run 'skedyul dev <command> --help' for more information on a command.
`)
}

function printDevUsage(): void {
  console.log(`
skedyul dev - Development tools for testing MCP servers locally

Usage:
  skedyul dev <command> [options]

Commands:
  invoke <tool>   Invoke a tool from the registry
  tools           List all tools in the registry
  serve           Start a local MCP server

Examples:
  skedyul dev invoke my_tool --registry ./dist/registry.js --args '{"key": "value"}'
  skedyul dev tools --registry ./dist/registry.js
  skedyul dev serve --registry ./dist/registry.js --port 3001

Options:
  --help, -h      Show help for a command
`)
}

async function main(): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage()
    process.exit(0)
  }

  const command = args[0]

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

