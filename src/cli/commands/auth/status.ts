import * as fs from 'fs'
import * as path from 'path'
import { parseArgs } from '../../utils'
import {
  getCredentials,
  getActiveProfileName,
  listProfiles,
} from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth status - Show authentication status

Usage:
  skedyul auth status [options]

Options:
  --help, -h    Show this help message

Shows:
  - Active profile and credentials
  - All available profiles
  - Linked workplaces (from .skedyul/links/)
`)
}

export async function statusCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  console.log('Skedyul CLI Status')
  console.log('═'.repeat(60))

  const activeProfileName = getActiveProfileName()
  const credentials = getCredentials()
  const profiles = listProfiles()

  console.log('')
  console.log('ACTIVE PROFILE')
  console.log('─'.repeat(60))

  if (!activeProfileName || !credentials) {
    console.log('  Not logged in')
    console.log('')
    console.log(`  Run 'skedyul auth login' to authenticate.`)
  } else {
    console.log(`  Profile:  ${activeProfileName}`)
    console.log(`  Email:    ${credentials.email}`)
    console.log(`  Username: ${credentials.username}`)
    console.log(`  Server:   ${credentials.serverUrl}`)

    if (credentials.expiresAt) {
      const expiresAt = new Date(credentials.expiresAt)
      const now = new Date()
      if (expiresAt < now) {
        console.log(`  Token:    EXPIRED`)
      } else {
        const diffMs = expiresAt.getTime() - now.getTime()
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const diffHours = Math.floor(
          (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        )
        console.log(`  Token:    Valid (expires in ${diffDays}d ${diffHours}h)`)
      }
    } else {
      console.log(`  Token:    Valid (no expiration)`)
    }
  }

  console.log('')
  console.log('ALL PROFILES')
  console.log('─'.repeat(60))

  if (profiles.length === 0) {
    console.log('  No profiles saved')
  } else {
    for (const { name, profile, isActive, isExpired } of profiles) {
      const marker = isActive ? '*' : ' '
      const expiredTag = isExpired ? ' [EXPIRED]' : ''
      console.log(`  ${marker} ${name}${expiredTag}`)
      console.log(`      Server: ${profile.serverUrl}`)
      console.log(`      Email:  ${profile.email}`)
    }
    console.log('')
    console.log('  * = active profile')
  }

  const linksDir = path.join(process.cwd(), '.skedyul', 'links')
  console.log('')
  console.log('LINKED WORKPLACES (this project)')
  console.log('─'.repeat(60))

  if (fs.existsSync(linksDir)) {
    const linkFiles = fs.readdirSync(linksDir).filter((f) => f.endsWith('.json'))

    if (linkFiles.length > 0) {
      for (const file of linkFiles) {
        const subdomain = file.replace('.json', '')
        try {
          const content = fs.readFileSync(path.join(linksDir, file), 'utf-8')
          const link = JSON.parse(content)
          console.log(`  - ${subdomain} (${link.appHandle})`)
        } catch {
          console.log(`  - ${subdomain} (error reading link file)`)
        }
      }
    } else {
      console.log('  No workplaces linked')
    }
  } else {
    console.log('  No workplaces linked')
  }

  console.log('')
  console.log('═'.repeat(60))
  console.log('')
  console.log('Commands:')
  console.log('  skedyul auth login              Add a new profile')
  console.log('  skedyul auth use <profile>      Switch active profile')
  console.log('  skedyul auth list               List all profiles')
  console.log('  skedyul dev link --workplace    Link a workplace')
}
