/**
 * skedyul config command
 *
 * Manage global CLI configuration.
 *
 * Usage:
 *   skedyul config set <key> <value>  - Set a config value
 *   skedyul config get <key>           - Get a config value
 *   skedyul config list                - List all config values
 */

import { getConfig, saveConfig, type AuthConfig } from '../utils/auth'

type ConfigKey = keyof AuthConfig

const VALID_KEYS: ConfigKey[] = ['defaultServer', 'ngrokAuthtoken']

export async function configCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  switch (subcommand) {
    case 'set':
      await setConfig(args.slice(1))
      break
    case 'get':
      await getConfigValue(args.slice(1))
      break
    case 'list':
      await listConfig()
      break
    default:
      printConfigHelp()
  }
}

async function setConfig(args: string[]): Promise<void> {
  const [key, ...valueParts] = args
  const value = valueParts.join(' ')

  if (!key || !value) {
    console.error('Usage: skedyul config set <key> <value>')
    console.error('')
    console.error('Available keys:')
    for (const k of VALID_KEYS) {
      console.error(`  ${k}`)
    }
    process.exit(1)
  }

  if (!VALID_KEYS.includes(key as ConfigKey)) {
    console.error(`Unknown config key: ${key}`)
    console.error('')
    console.error('Available keys:')
    for (const k of VALID_KEYS) {
      console.error(`  ${k}`)
    }
    process.exit(1)
  }

  const config = getConfig()
  ;(config as unknown as Record<string, string>)[key] = value
  saveConfig(config)

  console.log(`✓ Set ${key} = ${key === 'ngrokAuthtoken' ? '***' : value}`)
}

async function getConfigValue(args: string[]): Promise<void> {
  const [key] = args

  if (!key) {
    console.error('Usage: skedyul config get <key>')
    console.error('')
    console.error('Available keys:')
    for (const k of VALID_KEYS) {
      console.error(`  ${k}`)
    }
    process.exit(1)
  }

  const config = getConfig()
  const value = (config as unknown as Record<string, string | undefined>)[key]

  if (value === undefined) {
    console.log(`${key}: (not set)`)
  } else if (key === 'ngrokAuthtoken') {
    // Mask the authtoken for security
    console.log(`${key}: ${value.slice(0, 8)}...${value.slice(-4)}`)
  } else {
    console.log(`${key}: ${value}`)
  }
}

async function listConfig(): Promise<void> {
  const config = getConfig()

  console.log('Skedyul CLI Configuration')
  console.log('=========================')
  console.log('')
  console.log(`Config file: ~/.skedyul/config.json`)
  console.log('')

  for (const key of VALID_KEYS) {
    const value = (config as unknown as Record<string, string | undefined>)[key]
    if (value === undefined) {
      console.log(`  ${key}: (not set)`)
    } else if (key === 'ngrokAuthtoken') {
      console.log(`  ${key}: ${value.slice(0, 8)}...${value.slice(-4)}`)
    } else {
      console.log(`  ${key}: ${value}`)
    }
  }
}

function printConfigHelp(): void {
  console.log(`
skedyul config - Manage global CLI configuration

USAGE
  skedyul config <command> [options]

COMMANDS
  set <key> <value>   Set a config value
  get <key>           Get a config value
  list                List all config values

CONFIG KEYS
  defaultServer       Default server URL (default: https://admin.skedyul.it)
  ngrokAuthtoken      Your ngrok authtoken for tunneling

EXAMPLES
  # Set ngrok authtoken
  skedyul config set ngrokAuthtoken 2abc123_yourtoken

  # View current config
  skedyul config list

  # Get a specific value
  skedyul config get defaultServer
`)
}

export { configCommand as config }
