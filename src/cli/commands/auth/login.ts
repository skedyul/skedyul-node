import { parseArgs } from '../../utils'
import {
  getProfile,
  saveCredentials,
  startOAuthCallback,
  getServerUrl,
  generateProfileName,
  getProfiles,
  ensureUniqueProfileName,
} from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth login - Authenticate with Skedyul

Usage:
  skedyul auth login [options]

Options:
  --server, -s      Skedyul server URL (default: https://admin.skedyul.it)
  --profile, -p     Profile name to save credentials under
                    (auto-generated from server URL if not provided)
  --help, -h        Show this help message

Examples:
  # Login to production Skedyul (profile: production)
  skedyul auth login

  # Login to a local Skedyul instance (profile: local)
  skedyul auth login --server http://localhost:3000

  # Login with a custom profile name
  skedyul auth login --server http://localhost:3000 --profile my-local

  # Login to staging with custom profile
  skedyul auth login --server https://staging.skedyul.it --profile staging
`)
}

export async function loginCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const serverUrl = getServerUrl(
    (flags.server || flags.s) as string | undefined,
  )

  const requestedProfile = (flags.profile || flags.p) as string | undefined

  const profilesFile = getProfiles()
  let profileName: string

  if (requestedProfile) {
    profileName = requestedProfile
    const existingProfile = getProfile(profileName)
    if (existingProfile) {
      console.log(`Profile "${profileName}" already exists.`)
      console.log(`  Email: ${existingProfile.email}`)
      console.log(`  Server: ${existingProfile.serverUrl}`)
      console.log(`\nTo switch to this profile, run: skedyul auth use ${profileName}`)
      console.log(`To logout and re-login, run: skedyul auth logout --profile ${profileName}`)
      return
    }
  } else {
    const baseName = generateProfileName(serverUrl)
    profileName = ensureUniqueProfileName(baseName, profilesFile.profiles)
  }

  console.log(`Authenticating with ${serverUrl}...`)
  console.log(`Profile: ${profileName}\n`)

  try {
    const result = await startOAuthCallback(serverUrl)

    const savedProfileName = saveCredentials(
      {
        token: result.token,
        userId: result.userId,
        username: result.username,
        email: result.email,
        serverUrl,
        expiresAt: result.expiresAt,
        createdAt: new Date().toISOString(),
      },
      profileName,
    )

    console.log(`\nLogged in as ${result.email}`)
    console.log(`  Profile: ${savedProfileName}`)
    console.log(`  Server: ${serverUrl}`)
    console.log(`  Credentials saved to ~/.skedyul/profiles.json`)
    console.log(`\nThis profile is now active. To switch profiles, run: skedyul auth use <profile>`)
  } catch (error) {
    console.error(
      `\nAuthentication failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
