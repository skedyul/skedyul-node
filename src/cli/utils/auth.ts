import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as http from 'http'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StoredCredentials {
  token: string
  userId: string
  username: string
  email: string
  serverUrl: string
  expiresAt: string | null
  createdAt: string
}

export interface AuthConfig {
  defaultServer: string
  ngrokAuthtoken?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

const SKEDYUL_HOME_DIR = path.join(os.homedir(), '.skedyul')
const CREDENTIALS_FILE = path.join(SKEDYUL_HOME_DIR, 'credentials.json')
const CONFIG_FILE = path.join(SKEDYUL_HOME_DIR, 'config.json')

// Local project config (for development overrides)
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
// Credentials Management
// ─────────────────────────────────────────────────────────────────────────────

export function getCredentials(): StoredCredentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return null
  }

  try {
    const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
    const credentials = JSON.parse(content) as StoredCredentials

    // Check if expired
    if (credentials.expiresAt) {
      const expiresAt = new Date(credentials.expiresAt)
      if (expiresAt < new Date()) {
        return null
      }
    }

    return credentials
  } catch {
    return null
  }
}

export function saveCredentials(credentials: StoredCredentials): void {
  ensureHomeDir()
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
    mode: 0o600, // Read/write for owner only
  })
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE)
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
 * Priority: CLI flag > local config > credentials > global config > default
 */
export function getServerUrl(override?: string): string {
  // 1. CLI flag takes precedence
  if (override) return override

  // 2. Local project config (for development)
  const localConfig = getLocalConfig()
  if (localConfig.serverUrl) return localConfig.serverUrl

  // 3. Stored credentials
  const credentials = getCredentials()
  if (credentials?.serverUrl) return credentials.serverUrl

  // 4. Global config
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

      // Handle callback
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
              <h1 style="color: #38a169;">✓ Authentication Successful</h1>
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

    // Find an available port
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

      // Try to open browser
      openBrowser(authUrl).catch(() => {
        console.log(`(Could not open browser automatically)`)
      })
    })

    server.on('error', (err) => {
      cleanup()
      reject(err)
    })

    // Timeout after 5 minutes
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
  // Try to dynamically import 'open' package
  try {
    const open = await import('open')
    await open.default(url)
  } catch {
    // Fallback to platform-specific commands
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
