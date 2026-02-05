import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkConfig {
  appId: string
  appHandle: string
  appVersionId: string
  appVersionHandle: string
  appInstallationId: string
  workplaceId: string
  workplaceSubdomain: string
  createdAt: string
  serverUrl: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

const SKEDYUL_DIR = '.skedyul'
const LINKS_DIR = 'links'
const ENV_DIR = 'env'

function getSkedyulDir(projectDir?: string): string {
  return path.join(projectDir ?? process.cwd(), SKEDYUL_DIR)
}

function getLinksDir(projectDir?: string): string {
  return path.join(getSkedyulDir(projectDir), LINKS_DIR)
}

function getEnvDir(projectDir?: string): string {
  return path.join(getSkedyulDir(projectDir), ENV_DIR)
}

function getLinkFilePath(workplaceSubdomain: string, projectDir?: string): string {
  return path.join(getLinksDir(projectDir), `${workplaceSubdomain}.json`)
}

function getEnvFilePath(workplaceSubdomain: string, projectDir?: string): string {
  return path.join(getEnvDir(projectDir), `${workplaceSubdomain}.env`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Link Management
// ─────────────────────────────────────────────────────────────────────────────

export function ensureSkedyulDirs(projectDir?: string): void {
  const skedyulDir = getSkedyulDir(projectDir)
  const linksDir = getLinksDir(projectDir)
  const envDir = getEnvDir(projectDir)

  if (!fs.existsSync(skedyulDir)) {
    fs.mkdirSync(skedyulDir, { recursive: true })
  }

  if (!fs.existsSync(linksDir)) {
    fs.mkdirSync(linksDir, { recursive: true })
  }

  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true })
  }

  // Create .gitignore if it doesn't exist
  const gitignorePath = path.join(skedyulDir, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `# Ignore all local development files
*
!.gitignore
`)
  }
}

export function getLinkConfig(
  workplaceSubdomain: string,
  projectDir?: string,
): LinkConfig | null {
  const filePath = getLinkFilePath(workplaceSubdomain, projectDir)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as LinkConfig
  } catch {
    return null
  }
}

export function saveLinkConfig(
  config: LinkConfig,
  projectDir?: string,
): void {
  ensureSkedyulDirs(projectDir)
  const filePath = getLinkFilePath(config.workplaceSubdomain, projectDir)
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2))
}

export function deleteLinkConfig(
  workplaceSubdomain: string,
  projectDir?: string,
): boolean {
  const filePath = getLinkFilePath(workplaceSubdomain, projectDir)

  if (!fs.existsSync(filePath)) {
    return false
  }

  fs.unlinkSync(filePath)
  return true
}

export function listLinkedWorkplaces(projectDir?: string): string[] {
  const linksDir = getLinksDir(projectDir)

  if (!fs.existsSync(linksDir)) {
    return []
  }

  return fs
    .readdirSync(linksDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment File Management
// ─────────────────────────────────────────────────────────────────────────────

export function loadEnvFile(
  workplaceSubdomain: string,
  projectDir?: string,
): Record<string, string> {
  const filePath = getEnvFilePath(workplaceSubdomain, projectDir)
  const env: Record<string, string> = {}

  if (!fs.existsSync(filePath)) {
    return env
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const equalIndex = trimmed.indexOf('=')
    if (equalIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, equalIndex).trim()
    let value = trimmed.slice(equalIndex + 1).trim()

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

export function saveEnvFile(
  workplaceSubdomain: string,
  env: Record<string, string>,
  projectDir?: string,
): void {
  ensureSkedyulDirs(projectDir)
  const filePath = getEnvFilePath(workplaceSubdomain, projectDir)

  const lines = Object.entries(env).map(([key, value]) => {
    // Quote values that contain special characters
    if (value.includes(' ') || value.includes('=') || value.includes('#')) {
      return `${key}="${value}"`
    }
    return `${key}=${value}`
  })

  fs.writeFileSync(filePath, lines.join('\n') + '\n')
}

export function deleteEnvFile(
  workplaceSubdomain: string,
  projectDir?: string,
): boolean {
  const filePath = getEnvFilePath(workplaceSubdomain, projectDir)

  if (!fs.existsSync(filePath)) {
    return false
  }

  fs.unlinkSync(filePath)
  return true
}
