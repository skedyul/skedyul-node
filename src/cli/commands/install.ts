import { parseArgs } from '../utils'
import { getLinkConfig, loadEnvFile, saveEnvFile } from '../utils/link'
import { loadAppConfig, loadInstallConfig } from '../utils/config'
import { prompt } from '../utils/prompt'
import { getCredentials } from '../utils/auth'
import {
  buildInstallScopedEnvFields,
  syncInstallEnvToPlatform,
  type EnvConfigField,
} from '../utils/env-sync'

function printHelp(): void {
  console.log(`
skedyul dev install - Configure installation environment variables

Usage:
  skedyul dev install --workplace <subdomain> [options]

Options:
  --workplace, -w      Workplace subdomain (required)
  --force              Re-prompt even when all required variables are already set
  --skip-validation    Skip install handler validation
  --help, -h           Show this help message

Description:
  Prompts for install-scoped environment variables (scope: 'install' in
  install.config or provision/env.ts). Provision-scoped variables are configured
  when you run 'skedyul dev serve'.

  Values are stored locally in .skedyul/env/{subdomain}.env and synced to
  Skedyul when logged in.

Prerequisites:
  - Run 'skedyul dev link --workplace <subdomain>' first

Examples:
  skedyul dev install --workplace demo-clinic
`)
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

  const linkConfig = getLinkConfig(workplaceSubdomain)
  if (!linkConfig) {
    console.error(`Error: Not linked to ${workplaceSubdomain}`)
    console.error(`Run 'skedyul dev link --workplace ${workplaceSubdomain}' first.`)
    process.exit(1)
  }

  const credentials = getCredentials()
  if (!credentials) {
    console.error('Error: Not logged in.')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }

  const appConfig = await loadAppConfig()
  if (!appConfig) {
    console.error('Error: No skedyul.config.ts found in current directory.')
    process.exit(1)
  }

  const debug = flags.debug === true
  await loadInstallConfig(undefined, debug)

  const envFields = await buildInstallScopedEnvFields()

  if (envFields.length === 0) {
    console.log('No install-scoped environment variables defined for this app.')
    console.log('Provision variables are configured when you run dev serve.')
    console.log('Your app is ready to use.')
    return
  }

  const existingEnv = loadEnvFile(workplaceSubdomain)
  const force = flags.force === true

  const missingRequired = envFields.filter(
    ({ key, field }) =>
      field.required && (!existingEnv[key] || existingEnv[key].trim() === ''),
  )

  if (missingRequired.length === 0 && !force) {
    console.log(`\nInstall environment already configured for ${workplaceSubdomain}`)
    console.log(`App: ${appConfig.handle}`)
    console.log('─'.repeat(50))

    for (const { key, field } of envFields) {
      const value = existingEnv[key]
      const isSet = value !== undefined && value !== ''
      const isSecret = field.visibility === 'encrypted'
      console.log(
        `  ✓ ${field.label || key}: ${isSet ? (isSecret ? '••••••••' : value) : '(not set)'}`,
      )
    }

    await syncInstallEnvToPlatform(linkConfig, credentials.token, existingEnv, envFields)

    console.log(`\nNext step:`)
    console.log(
      `  Run 'skedyul dev serve --workplace ${workplaceSubdomain}' to start the local server`,
    )
    return
  }

  if (force && missingRequired.length === 0) {
    console.log(`\nRe-configuring install environment for ${workplaceSubdomain} (--force)`)
  } else {
    console.log(`\nConfiguring install environment for ${workplaceSubdomain}`)
  }
  console.log(`App: ${appConfig.handle}`)
  console.log('─'.repeat(50))

  const newEnv: Record<string, string> = { ...existingEnv }

  for (const { key, field } of envFields) {
    const currentValue = existingEnv[key]
    const isSet = currentValue !== undefined && currentValue !== ''
    const isSecret = field.visibility === 'encrypted'

    console.log(`\n${field.label || key}`)
    if (field.description) {
      console.log(`  ${field.description}`)
    }
    if (field.placeholder) {
      console.log(`  Example: ${field.placeholder}`)
    }
    console.log(`  Key: ${key}${field.required ? ' (required)' : ''}`)
    console.log(`  Current: ${isSet ? (isSecret ? '••••••••' : currentValue) : '(not set)'}`)

    const value = await prompt({
      message: `  Enter ${key}`,
      default: currentValue,
      required: field.required ?? false,
      hidden: isSecret,
    })

    if (value) {
      newEnv[key] = value
    }
  }

  const installEnv: Record<string, string> = { ...existingEnv }
  for (const { key } of envFields) {
    if (newEnv[key] !== undefined) {
      installEnv[key] = newEnv[key]
    }
  }

  saveEnvFile(workplaceSubdomain, installEnv)

  console.log(`\n✓ Saved to .skedyul/env/${workplaceSubdomain}.env`)

  await syncInstallEnvToPlatform(linkConfig, credentials.token, installEnv, envFields)

  console.log(`\nNext step:`)
  console.log(
    `  Run 'skedyul dev serve --workplace ${workplaceSubdomain}' to start the local server`,
  )
}
