import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as http from 'http'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Profile {
  serverUrl: string
  token: string
  userId: string
  username: string
  email: string
  expiresAt: string | null
  createdAt: string
}

export interface ProfilesFile {
  profiles: Record<string, Profile>
}

export interface AuthConfig {
  activeProfile?: string
  defaultServer: string
  ngrokAuthtoken?: string
}

/** @deprecated Use Profile instead - kept for migration */
export interface StoredCredentials {
  token: string
  userId: string
  username: string
  email: string
  serverUrl: string
  expiresAt: string | null
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

const SKEDYUL_HOME_DIR = path.join(os.homedir(), '.skedyul')
const PROFILES_FILE = path.join(SKEDYUL_HOME_DIR, 'profiles.json')
const CONFIG_FILE = path.join(SKEDYUL_HOME_DIR, 'config.json')
const LEGACY_CREDENTIALS_FILE = path.join(SKEDYUL_HOME_DIR, 'credentials.json')

const LOCAL_CONFIG_FILE = '.skedyul.local.json'

const DEFAULT_SERVER_URL = 'https://admin.skedyul.it'

// ─────────────────────────────────────────────────────────────────────────────
// Directory Management
// ─────────────────────────────────────────────────────────────────────────────

function ensureHomeDir(): void {
  if (!fs.existsSync(SKEDYUL_HOME_DIR)) {
    fs.mkdirSync(SKEDYUL_HOME_DIR, { recursive: true, mode: 0o700 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Name Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a sensible profile name from a server URL.
 */
export function generateProfileName(serverUrl: string): string {
  try {
    const url = new URL(serverUrl)
    const hostname = url.hostname.toLowerCase()

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'local'
    }

    if (hostname.includes('staging')) {
      return 'staging'
    }

    if (hostname === 'admin.skedyul.it' || hostname === 'app.skedyul.com') {
      return 'production'
    }

    const parts = hostname.split('.')
    if (parts.length > 0) {
      return parts[0].replace(/[^a-z0-9-]/g, '')
    }

    return 'default'
  } catch {
    return 'default'
  }
}

/**
 * Ensure a profile name is unique by appending a number if needed.
 */
export function ensureUniqueProfileName(
  baseName: string,
  existingProfiles: Record<string, Profile>,
): string {
  if (!existingProfiles[baseName]) {
    return baseName
  }

  let counter = 2
  while (existingProfiles[`${baseName}-${counter}`]) {
    counter++
  }
  return `${baseName}-${counter}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration from Legacy credentials.json
// ─────────────────────────────────────────────────────────────────────────────

function migrateLegacyCredentials(): void {
  if (!fs.existsSync(LEGACY_CREDENTIALS_FILE)) {
    return
  }

  if (fs.existsSync(PROFILES_FILE)) {
    return
  }

  try {
    const content = fs.readFileSync(LEGACY_CREDENTIALS_FILE, 'utf-8')
    const legacy = JSON.parse(content) as StoredCredentials

    const profileName = generateProfileName(legacy.serverUrl)

    const profile: Profile = {
      serverUrl: legacy.serverUrl,
      token: legacy.token,
      userId: legacy.userId,
      username: legacy.username,
      email: legacy.email,
      expiresAt: legacy.expiresAt,
      createdAt: legacy.createdAt,
    }

    const profilesFile: ProfilesFile = {
      profiles: {
        [profileName]: profile,
      },
    }

    ensureHomeDir()
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profilesFile, null, 2), {
      mode: 0o600,
    })

    const config = getConfig()
    config.activeProfile = profileName
    saveConfig(config)

    fs.unlinkSync(LEGACY_CREDENTIALS_FILE)

    console.error(`Migrated credentials to profile: ${profileName}`)
  } catch (error) {
    console.error('Failed to migrate legacy credentials:', error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Profiles Management
// ─────────────────────────────────────────────────────────────────────────────

export function getProfiles(): ProfilesFile {
  migrateLegacyCredentials()

  if (!fs.existsSync(PROFILES_FILE)) {
    return { profiles: {} }
  }

  try {
    const content = fs.readFileSync(PROFILES_FILE, 'utf-8')
    return JSON.parse(content) as ProfilesFile
  } catch {
    return { profiles: {} }
  }
}

export function saveProfiles(profilesFile: ProfilesFile): void {
  ensureHomeDir()
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profilesFile, null, 2), {
    mode: 0o600,
  })
}

export function getProfile(name: string): Profile | null {
  const profilesFile = getProfiles()
  const profile = profilesFile.profiles[name]

  if (!profile) {
    return null
  }

  if (profile.expiresAt) {
    const expiresAt = new Date(profile.expiresAt)
    if (expiresAt < new Date()) {
      return null
    }
  }

  return profile
}

export function saveProfile(name: string, profile: Profile): void {
  const profilesFile = getProfiles()
  profilesFile.profiles[name] = profile
  saveProfiles(profilesFile)
}

export function deleteProfile(name: string): boolean {
  const profilesFile = getProfiles()
  if (!profilesFile.profiles[name]) {
    return false
  }

  delete profilesFile.profiles[name]
  saveProfiles(profilesFile)

  const config = getConfig()
  if (config.activeProfile === name) {
    const remainingProfiles = Object.keys(profilesFile.profiles)
    config.activeProfile = remainingProfiles[0] ?? undefined
    saveConfig(config)
  }

  return true
}

export function listProfiles(): Array<{
  name: string
  profile: Profile
  isActive: boolean
  isExpired: boolean
}> {
  const profilesFile = getProfiles()
  const config = getConfig()
  const activeProfile = config.activeProfile

  return Object.entries(profilesFile.profiles).map(([name, profile]) => {
    let isExpired = false
    if (profile.expiresAt) {
      isExpired = new Date(profile.expiresAt) < new Date()
    }

    return {
      name,
      profile,
      isActive: name === activeProfile,
      isExpired,
    }
  })
}

export function clearAllProfiles(): void {
  if (fs.existsSync(PROFILES_FILE)) {
    fs.unlinkSync(PROFILES_FILE)
  }

  const config = getConfig()
  delete config.activeProfile
  saveConfig(config)
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Profile Management
// ─────────────────────────────────────────────────────────────────────────────

export function getActiveProfileName(): string | null {
  const config = getConfig()
  return config.activeProfile ?? null
}

export function setActiveProfile(name: string): boolean {
  const profilesFile = getProfiles()
  if (!profilesFile.profiles[name]) {
    return false
  }

  const config = getConfig()
  config.activeProfile = name
  saveConfig(config)
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Credentials Management (uses active profile)
// ─────────────────────────────────────────────────────────────────────────────

export function getCredentials(): StoredCredentials | null {
  const activeProfileName = getActiveProfileName()
  if (!activeProfileName) {
    return null
  }

  const profile = getProfile(activeProfileName)
  if (!profile) {
    return null
  }

  return {
    token: profile.token,
    userId: profile.userId,
    username: profile.username,
    email: profile.email,
    serverUrl: profile.serverUrl,
    expiresAt: profile.expiresAt,
    createdAt: profile.createdAt,
  }
}

export function saveCredentials(
  credentials: StoredCredentials,
  profileName?: string,
): string {
  const name =
    profileName ?? generateProfileName(credentials.serverUrl)
  const profilesFile = getProfiles()
  const finalName = profileName
    ? name
    : ensureUniqueProfileName(name, profilesFile.profiles)

  const profile: Profile = {
    serverUrl: credentials.serverUrl,
    token: credentials.token,
    userId: credentials.userId,
    username: credentials.username,
    email: credentials.email,
    expiresAt: credentials.expiresAt,
    createdAt: credentials.createdAt,
  }

  saveProfile(finalName, profile)

  const config = getConfig()
  config.activeProfile = finalName
  saveConfig(config)

  return finalName
}

export function clearCredentials(): void {
  const activeProfileName = getActiveProfileName()
  if (activeProfileName) {
    deleteProfile(activeProfileName)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Management
// ─────────────────────────────────────────────────────────────────────────────

export function getConfig(): AuthConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { defaultServer: DEFAULT_SERVER_URL }
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(content) as AuthConfig
  } catch {
    return { defaultServer: DEFAULT_SERVER_URL }
  }
}

export function saveConfig(config: AuthConfig): void {
  ensureHomeDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

/**
 * Get local project config (for development overrides).
 * Looks for .skedyul.local.json in current directory.
 */
export function getLocalConfig(): { serverUrl?: string } {
  const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_FILE)

  if (!fs.existsSync(localConfigPath)) {
    return {}
  }

  try {
    const content = fs.readFileSync(localConfigPath, 'utf-8')
    return JSON.parse(content) as { serverUrl?: string }
  } catch {
    return {}
  }
}

/**
 * Get the server URL to use.
 * Priority: CLI flag > local config > active profile > global config > default
 */
export function getServerUrl(override?: string): string {
  if (override) return override

  const localConfig = getLocalConfig()
  if (localConfig.serverUrl) return localConfig.serverUrl

  const credentials = getCredentials()
  if (credentials?.serverUrl) return credentials.serverUrl

  return getConfig().defaultServer
}

/**
 * Get the ngrok authtoken from global config.
 */
export function getNgrokAuthtoken(): string | undefined {
  return getConfig().ngrokAuthtoken
}

/**
 * Set the ngrok authtoken in global config.
 */
export function setNgrokAuthtoken(authtoken: string): void {
  const config = getConfig()
  config.ngrokAuthtoken = authtoken
  saveConfig(config)
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Flow
// ─────────────────────────────────────────────────────────────────────────────

interface OAuthCallbackResult {
  token: string
  userId: string
  username: string
  email: string
  expiresAt: string | null
}

/**
 * Start a local HTTP server to receive the OAuth callback
 */
export async function startOAuthCallback(
  serverUrl: string,
): Promise<OAuthCallbackResult> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`)
      const searchParams = url.searchParams

      if (url.pathname === '/callback') {
        const token = searchParams.get('token')
        const userId = searchParams.get('userId')
        const username = searchParams.get('username')
        const email = searchParams.get('email')
        const expiresAt = searchParams.get('expiresAt')
        const error = searchParams.get('error')

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #e53e3e;">Authentication Failed</h1>
                <p>${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `)
          cleanup()
          server.close()
          reject(new Error(error))
          return
        }

        if (!token || !userId || !username || !email) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #e53e3e;">Authentication Failed</h1>
                <p>Missing required parameters in callback</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `)
          cleanup()
          server.close()
          reject(new Error('Missing required parameters in callback'))
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #38a169;">Authentication Successful</h1>
              <p>Logged in as <strong>${email}</strong></p>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `)

        cleanup()
        server.close()
        resolve({
          token,
          userId,
          username,
          email,
          expiresAt,
        })
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        cleanup()
        reject(new Error('Failed to get server address'))
        return
      }

      const port = address.port
      const callbackUrl = `http://localhost:${port}/callback`
      const authUrl = `${serverUrl}/api/cli/auth?redirect=${encodeURIComponent(callbackUrl)}`

      console.log(`Opening browser for authentication...`)
      console.log(`If browser doesn't open, visit: ${authUrl}`)
      console.log(`Waiting for callback on ${callbackUrl}...`)

      openBrowser(authUrl).catch(() => {
        console.log(`(Could not open browser automatically)`)
      })
    })

    server.on('error', (err) => {
      cleanup()
      reject(err)
    })

    timeoutId = setTimeout(() => {
      server.close()
      reject(new Error('Authentication timed out'))
    }, 5 * 60 * 1000)
  })
}

/**
 * Open a URL in the default browser
 */
async function openBrowser(url: string): Promise<void> {
  try {
    const open = await import('open')
    await open.default(url)
  } catch {
    const { exec } = await import('child_process')
    const platform = process.platform

    let command: string
    if (platform === 'darwin') {
      command = `open "${url}"`
    } else if (platform === 'win32') {
      command = `start "" "${url}"`
    } else {
      command = `xdg-open "${url}"`
    }

    return new Promise((resolve, reject) => {
      exec(command, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API Client for CLI
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiClientOptions {
  serverUrl: string
  token?: string
}

export async function callCliApi<T>(
  options: ApiClientOptions,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${options.serverUrl}/api/cli${endpoint}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    let message = `API error: ${response.status}`
    try {
      const json = JSON.parse(text)
      if (json.error) message = json.error
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}
