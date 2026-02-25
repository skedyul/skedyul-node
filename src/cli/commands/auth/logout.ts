import { parseArgs } from '../../utils'
import {
  getActiveProfileName,
  getProfile,
  deleteProfile,
  clearAllProfiles,
  listProfiles,
} from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth logout - Log out from Skedyul

Usage:
  skedyul auth logout [options]

Options:
  --profile, -p     Logout from a specific profile (default: active profile)
  --all             Logout from all profiles
  --help, -h        Show this help message

Examples:
  # Logout from active profile
  skedyul auth logout

  # Logout from a specific profile
  skedyul auth logout --profile local

  # Logout from all profiles
  skedyul auth logout --all
`)
}

export async function logoutCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  if (flags.all) {
    const profiles = listProfiles()
    if (profiles.length === 0) {
      console.log('No profiles to logout from.')
      return
    }

    clearAllProfiles()
    console.log(`Logged out from ${profiles.length} profile(s):`)
    for (const { name, profile } of profiles) {
      console.log(`  - ${name} (${profile.email})`)
    }
    console.log('')
    console.log('All credentials removed from ~/.skedyul/profiles.json')
    return
  }

  const profileName = (flags.profile || flags.p) as string | undefined
  const targetProfile = profileName ?? getActiveProfileName()

  if (!targetProfile) {
    console.log('No active profile. Nothing to logout from.')
    console.log('')
    const profiles = listProfiles()
    if (profiles.length > 0) {
      console.log('Available profiles:')
      for (const { name, profile } of profiles) {
        console.log(`  - ${name} (${profile.serverUrl})`)
      }
      console.log('')
      console.log('Use --profile <name> to logout from a specific profile.')
    }
    return
  }

  const profile = getProfile(targetProfile)
  if (!profile) {
    console.error(`Profile "${targetProfile}" not found.`)
    console.error('')
    const profiles = listProfiles()
    if (profiles.length > 0) {
      console.error('Available profiles:')
      for (const { name, profile: p } of profiles) {
        console.error(`  - ${name} (${p.serverUrl})`)
      }
    }
    process.exit(1)
  }

  const deleted = deleteProfile(targetProfile)
  if (deleted) {
    console.log(`Logged out from profile: ${targetProfile}`)
    console.log(`  Email: ${profile.email}`)
    console.log(`  Server: ${profile.serverUrl}`)
    console.log('')
    console.log('Credentials removed from ~/.skedyul/profiles.json')

    const remainingProfiles = listProfiles()
    const newActive = remainingProfiles.find((p) => p.isActive)
    if (newActive) {
      console.log('')
      console.log(`Active profile is now: ${newActive.name}`)
    } else if (remainingProfiles.length > 0) {
      console.log('')
      console.log('No active profile. Use "skedyul auth use <profile>" to set one.')
    }
  } else {
    console.error(`Failed to logout from profile: ${targetProfile}`)
    process.exit(1)
  }
}
