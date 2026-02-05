import * as fs from 'fs'
import * as path from 'path'
import { parseArgs } from '../../utils'
import { getCredentials, getServerUrl } from '../../utils/auth'

function printHelp(): void {
  console.log(`
skedyul auth status - Show authentication status

Usage:
  skedyul auth status [options]

Options:
  --help, -h    Show this help message

Shows:
  - Current logged in user
  - Server URL
  - Token expiration
  - Linked workplaces (from .skedyul/links/)
`)
}

export async function statusCommand(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const credentials = getCredentials()

  console.log('Skedyul CLI Status')
  console.log('─'.repeat(40))

  if (!credentials) {
    console.log('\nAuthentication: Not logged in')
    console.log(`\nRun 'skedyul auth login' to authenticate.`)
    return
  }

  console.log('\nAuthentication:')
  console.log(`  Email: ${credentials.email}`)
  console.log(`  Username: ${credentials.username}`)
  console.log(`  Server: ${credentials.serverUrl}`)

  if (credentials.expiresAt) {
    const expiresAt = new Date(credentials.expiresAt)
    const now = new Date()
    if (expiresAt < now) {
      console.log(`  Token: Expired`)
    } else {
      const diffMs = expiresAt.getTime() - now.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const diffHours = Math.floor(
        (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      )
      console.log(`  Token: Valid (expires in ${diffDays}d ${diffHours}h)`)
    }
  } else {
    console.log(`  Token: Valid (no expiration)`)
  }

  // Check for linked workplaces in current project
  const linksDir = path.join(process.cwd(), '.skedyul', 'links')
  if (fs.existsSync(linksDir)) {
    const linkFiles = fs.readdirSync(linksDir).filter((f) => f.endsWith('.json'))

    if (linkFiles.length > 0) {
      console.log('\nLinked Workplaces (this project):')
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
      console.log('\nNo workplaces linked in this project.')
    }
  } else {
    console.log('\nNo workplaces linked in this project.')
  }

  console.log(`\nRun 'skedyul dev link --workplace <subdomain>' to link a workplace.`)
}
