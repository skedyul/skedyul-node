import { parseArgs } from '../../utils'
import { setActiveProfile, getProfile, listProfiles } from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth use - Switch to a different profile

Usage:
  skedyul auth use <profile-name>

Arguments:
  <profile-name>    Name of the profile to switch to

Options:
  --help, -h        Show this help message

Examples:
  # Switch to local profile
  skedyul auth use local

  # Switch to production profile
  skedyul auth use production

  # List available profiles first
  skedyul auth list
`)
}

export async function useCommand(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const profileName = positional[0]

  if (!profileName) {
    console.error('Error: Profile name is required')
    console.error('')
    
    const profiles = listProfiles()
    if (profiles.length > 0) {
      console.error('Available profiles:')
      for (const { name, profile, isActive } of profiles) {
        const marker = isActive ? '*' : ' '
        console.error(`  ${marker} ${name} (${profile.serverUrl})`)
      }
    } else {
      console.error('No profiles found. Run "skedyul auth login" to create one.')
    }
    
    process.exit(1)
  }

  const profile = getProfile(profileName)
  if (!profile) {
    console.error(`Error: Profile "${profileName}" not found or expired`)
    console.error('')
    
    const profiles = listProfiles()
    if (profiles.length > 0) {
      console.error('Available profiles:')
      for (const { name, profile: p, isActive } of profiles) {
        const marker = isActive ? '*' : ' '
        console.error(`  ${marker} ${name} (${p.serverUrl})`)
      }
    }
    
    process.exit(1)
  }

  const success = setActiveProfile(profileName)
  if (!success) {
    console.error(`Error: Failed to switch to profile "${profileName}"`)
    process.exit(1)
  }

  console.log(`Switched to profile: ${profileName}`)
  console.log(`  Server: ${profile.serverUrl}`)
  console.log(`  Email: ${profile.email}`)
}
