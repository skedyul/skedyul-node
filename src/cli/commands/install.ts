import { parseArgs } from '../utils'
import { getLinkConfig, loadEnvFile, saveEnvFile } from '../utils/link'
import { loadAppConfig } from '../utils/config'
import { prompt, confirm } from '../utils/prompt'

function printHelp(): void {
  console.log(`
skedyul dev install - Configure installation environment variables

Usage:
  skedyul dev install --workplace <subdomain> [options]

Options:
  --workplace, -w      Workplace subdomain (required)
  --skip-validation    Skip install handler validation
  --help, -h           Show this help message

Description:
  Prompts for environment variables defined in the app's install.config.
  Values are stored locally in .skedyul/env/{subdomain}.env

Prerequisites:
  - Run 'skedyul dev link --workplace <subdomain>' first

Examples:
  skedyul dev install --workplace demo-clinic
`)
}

interface EnvConfigField {
  name: string
  key: string
  description?: string
  required?: boolean
  secret?: boolean
}

export async function installCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const workplaceSubdomain = (flags.workplace || flags.w) as string | undefined

  if (!workplaceSubdomain) {
    console.error('Error: --workplace is required')
    console.error("Run 'skedyul dev install --help' for usage information.")
    process.exit(1)
  }

  // Check if linked
  const linkConfig = getLinkConfig(workplaceSubdomain)
  if (!linkConfig) {
    console.error(`Error: Not linked to ${workplaceSubdomain}`)
    console.error(`Run 'skedyul dev link --workplace ${workplaceSubdomain}' first.`)
    process.exit(1)
  }

  // Load skedyul.config to get env config
  const appConfig = await loadAppConfig()
  if (!appConfig) {
    console.error('Error: No skedyul.config.ts found in current directory.')
    process.exit(1)
  }

  // Get install config
  const installConfig = appConfig.install?.config as EnvConfigField[] | undefined
  if (!installConfig || installConfig.length === 0) {
    console.log('No environment variables defined in install.config.')
    console.log('Your app is ready to use.')
    return
  }

  // Load existing env values
  const existingEnv = loadEnvFile(workplaceSubdomain)

  console.log(`\nConfiguring environment for ${workplaceSubdomain}`)
  console.log(`App: ${appConfig.handle}`)
  console.log('─'.repeat(50))

  const newEnv: Record<string, string> = { ...existingEnv }

  for (const field of installConfig) {
    const currentValue = existingEnv[field.key]
    const isSet = currentValue !== undefined && currentValue !== ''

    console.log(`\n${field.name}`)
    if (field.description) {
      console.log(`  ${field.description}`)
    }
    console.log(`  Key: ${field.key}`)
    console.log(`  Current: ${isSet ? (field.secret ? '(set)' : currentValue) : '(not set)'}`)

    const value = await prompt({
      message: `  ${field.key}`,
      default: currentValue,
      required: field.required ?? false,
      hidden: field.secret ?? false,
    })

    if (value) {
      newEnv[field.key] = value
    }
  }

  // Save env file
  saveEnvFile(workplaceSubdomain, newEnv)

  console.log(`\n✓ Saved to .skedyul/env/${workplaceSubdomain}.env`)

  // Ask about validation
  const skipValidation = flags['skip-validation'] === true

  if (!skipValidation && appConfig.install?.onInstall) {
    const shouldValidate = await confirm({
      message: '\nRun validation handler?',
      default: true,
    })

    if (shouldValidate) {
      console.log('\nValidating configuration...')
      // TODO: Actually run the onInstall handler with the env vars
      // This would require loading and executing the handler
      // For now, just show a message
      console.log('  (Validation not yet implemented in CLI)')
    }
  }

  console.log(`\nNext step:`)
  console.log(`  Run 'skedyul dev serve --linked --workplace ${workplaceSubdomain}' to start testing`)
}
