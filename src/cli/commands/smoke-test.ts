import { spawn, ChildProcess } from 'child_process'
import * as http from 'http'
import * as fs from 'fs'

const SMOKE_TEST_PORT = 3456
const SMOKE_TEST_TIMEOUT_MS = 30000
const HEALTH_CHECK_INTERVAL_MS = 500
const HEALTH_CHECK_MAX_RETRIES = 30

function printSmokeTestHelp(): void {
  console.log(`
SKEDYUL SMOKE-TEST - Validate your built integration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Spawns the built server and validates it responds to tools/list.
This catches module-level errors that would crash the server on startup.

USAGE
  $ skedyul smoke-test [options]

OPTIONS
  --help, -h     Show this help message

EXAMPLES
  # Run smoke test after building
  $ skedyul build && skedyul smoke-test

WHAT IT DOES
  1. Spawns node dist/server/mcp_server.js as a child process
  2. Waits for the /health endpoint to respond
  3. Calls POST /mcp with tools/list JSON-RPC request
  4. Validates the response contains at least one tool
  5. Exits with code 0 (success) or 1 (failure)
`)
}

function makeRequest(
  port: number,
  path: string,
  method: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined

    const options: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {}
          resolve({ status: res.statusCode ?? 0, body: parsed })
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data })
        }
      })
    })

    req.on('error', reject)

    if (postData) {
      req.write(postData)
    }
    req.end()
  })
}

async function waitForHealth(port: number): Promise<boolean> {
  for (let i = 0; i < HEALTH_CHECK_MAX_RETRIES; i++) {
    try {
      const response = await makeRequest(port, '/health', 'GET')
      if (response.status === 200) {
        return true
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS))
  }
  return false
}

async function callToolsList(
  port: number,
): Promise<{ success: boolean; tools?: unknown[]; error?: string }> {
  try {
    const response = await makeRequest(port, '/mcp', 'POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    })

    if (response.status !== 200) {
      return {
        success: false,
        error: `tools/list returned status ${response.status}`,
      }
    }

    const body = response.body as {
      result?: { tools?: unknown[] }
      error?: { message?: string }
    }

    if (body.error) {
      return {
        success: false,
        error: `tools/list error: ${body.error.message ?? JSON.stringify(body.error)}`,
      }
    }

    if (!body.result?.tools) {
      return {
        success: false,
        error: 'tools/list response missing result.tools',
      }
    }

    return {
      success: true,
      tools: body.result.tools,
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to call tools/list: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export async function smokeTestCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printSmokeTestHelp()
    process.exit(0)
  }

  const serverPath = 'dist/server/mcp_server.js'

  // Check if built server exists
  if (!fs.existsSync(serverPath)) {
    console.error('[SmokeTest] ERROR: dist/server/mcp_server.js not found')
    console.error('[SmokeTest] Run "skedyul build" first')
    process.exit(1)
  }

  console.log('[SmokeTest] Starting smoke test...')
  console.log(`[SmokeTest] Server path: ${serverPath}`)
  console.log(`[SmokeTest] Port: ${SMOKE_TEST_PORT}`)

  let server: ChildProcess | null = null
  let serverLogs: string[] = []
  let serverExited = false
  let serverExitCode: number | null = null

  const cleanup = () => {
    if (server && !serverExited) {
      console.log('[SmokeTest] Stopping server...')
      server.kill('SIGTERM')
    }
  }

  // Handle process termination
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  try {
    // Spawn server as child process
    console.log('[SmokeTest] Spawning server process...')
    server = spawn('node', [serverPath], {
      env: {
        ...process.env,
        PORT: String(SMOKE_TEST_PORT),
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    })

    // Collect server output
    server.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) {
        serverLogs.push(line)
        console.log(`[Server] ${line}`)
      }
    })

    server.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) {
        serverLogs.push(`[stderr] ${line}`)
        console.error(`[Server] ${line}`)
      }
    })

    server.on('exit', (code) => {
      serverExited = true
      serverExitCode = code
      if (code !== null && code !== 0) {
        console.error(`[SmokeTest] Server exited with code ${code}`)
      }
    })

    server.on('error', (err) => {
      console.error(`[SmokeTest] Failed to spawn server: ${err.message}`)
    })

    // Wait a moment for server to start
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Check if server crashed immediately
    if (serverExited) {
      console.error('[SmokeTest] FAILED: Server crashed during startup')
      console.error(`[SmokeTest] Exit code: ${serverExitCode}`)
      console.error('[SmokeTest] Server logs:')
      serverLogs.forEach((log) => console.error(`  ${log}`))
      process.exit(1)
    }

    // Wait for health endpoint
    console.log('[SmokeTest] Waiting for server to be ready...')
    const healthy = await waitForHealth(SMOKE_TEST_PORT)

    if (!healthy) {
      // Check if server crashed while waiting
      if (serverExited) {
        console.error('[SmokeTest] FAILED: Server crashed during startup')
        console.error(`[SmokeTest] Exit code: ${serverExitCode}`)
      } else {
        console.error('[SmokeTest] FAILED: Server did not become healthy')
      }
      console.error('[SmokeTest] Server logs:')
      serverLogs.forEach((log) => console.error(`  ${log}`))
      cleanup()
      process.exit(1)
    }

    console.log('[SmokeTest] Server is healthy, calling tools/list...')

    // Call tools/list
    const result = await callToolsList(SMOKE_TEST_PORT)

    if (!result.success) {
      console.error(`[SmokeTest] FAILED: ${result.error}`)
      console.error('[SmokeTest] Server logs:')
      serverLogs.forEach((log) => console.error(`  ${log}`))
      cleanup()
      process.exit(1)
    }

    const toolCount = result.tools?.length ?? 0
    console.log(`[SmokeTest] tools/list returned ${toolCount} tool(s)`)

    if (toolCount === 0) {
      console.error('[SmokeTest] FAILED: No tools registered')
      cleanup()
      process.exit(1)
    }

    // List the tools
    const tools = result.tools as Array<{ name?: string }>
    tools.forEach((tool) => {
      console.log(`[SmokeTest]   - ${tool.name ?? 'unnamed'}`)
    })

    console.log('[SmokeTest] PASSED: Server started and tools/list responded successfully')
    cleanup()
    process.exit(0)
  } catch (err) {
    console.error(
      `[SmokeTest] FAILED: ${err instanceof Error ? err.message : String(err)}`,
    )
    console.error('[SmokeTest] Server logs:')
    serverLogs.forEach((log) => console.error(`  ${log}`))
    cleanup()
    process.exit(1)
  }
}
