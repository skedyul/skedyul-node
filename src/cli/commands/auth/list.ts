import { parseArgs } from '../../utils'
import { listProfiles } from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth list - List all authentication profiles

Usage:
  skedyul auth list [options]

Options:
  --help, -h    Show this help message

Output:
  Lists all saved profiles with their server URLs and email addresses.
  The active profile is marked with an asterisk (*).

Examples:
  skedyul auth list
`)
}

export async function listCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const profiles = listProfiles()

  if (profiles.length === 0) {
    console.log('No profiles found.')
    console.log('')
    console.log('Run "skedyul auth login" to create a profile.')
    return
  }

  console.log('Authentication Profiles')
  console.log('─'.repeat(60))
  console.log('')

  for (const { name, profile, isActive, isExpired } of profiles) {
    const marker = isActive ? '*' : ' '
    const expiredTag = isExpired ? ' [EXPIRED]' : ''
    
    console.log(`${marker} ${name}${expiredTag}`)
    console.log(`    Server: ${profile.serverUrl}`)
    console.log(`    Email:  ${profile.email}`)
    console.log('')
  }

  console.log('─'.repeat(60))
  console.log('* = active profile')
  console.log('')
  console.log('Commands:')
  console.log('  skedyul auth use <profile>     Switch to a profile')
  console.log('  skedyul auth login             Add a new profile')
  console.log('  skedyul auth logout --profile <name>  Remove a profile')
}
