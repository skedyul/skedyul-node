import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { loadConfig, CONFIG_FILE_NAMES } from '../../config/loader'

function printBuildHelp(): void {
  console.log(`
SKEDYUL BUILD - Build your integration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Builds your integration using configuration from skedyul.config.ts.
Automatically determines format (ESM/CJS) based on computeLayer and
includes external dependencies from build.external.

USAGE
  $ skedyul build [options]

OPTIONS
  --watch, -w    Watch for changes and rebuild automatically
  --help, -h     Show this help message

EXAMPLES
  # Build once
  $ skedyul build

  # Build and watch for changes
  $ skedyul build --watch

CONFIGURATION
  The build command reads from skedyul.config.ts:

  export default defineConfig({
    computeLayer: 'serverless',  // 'serverless' -> ESM, 'dedicated' -> CJS
    build: {
      external: ['twilio'],      // Additional externals to exclude
    },
  })

  Base externals (always included):
  - skedyul
  - skedyul/serverless or skedyul/dedicated
  - zod
`)
}

export async function buildCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printBuildHelp()
    process.exit(0)
  }

  const watch = args.includes('--watch') || args.includes('-w')

  // Find skedyul.config.ts in current directory
  const cwd = process.cwd()
  let configPath: string | null = null

  for (const name of CONFIG_FILE_NAMES) {
    const testPath = path.join(cwd, name)
    if (fs.existsSync(testPath)) {
      configPath = testPath
      break
    }
  }

  if (!configPath) {
    console.error('Error: No skedyul.config.ts found in current directory')
    console.error('Make sure you are in the root of your integration project.')
    process.exit(1)
  }

  console.log(`Loading config from ${path.basename(configPath)}...`)

  try {
    const config = await loadConfig(configPath)

    // Determine format based on computeLayer
    // COMPUTE_LAYER env var (from Docker build) takes precedence over config
    const computeLayer =
      (process.env.COMPUTE_LAYER as 'serverless' | 'dedicated') ??
      config.computeLayer ??
      'serverless'
    const format = computeLayer === 'serverless' ? 'esm' : 'cjs'

    // Build externals list
    const baseExternals = ['skedyul', `skedyul/${computeLayer}`, 'zod']
    const userExternals =
      config.build && 'external' in config.build
        ? (config.build.external as string[]) ?? []
        : []
    const allExternals = [...baseExternals, ...userExternals]

    // Build tsup args
    const tsupArgs = [
      'tsup',
      'src/server/mcp_server.ts',
      '--format',
      format,
      '--out-dir',
      'dist/server',
      '--target',
      'node22',
      '--clean',
      '--no-splitting',
      ...allExternals.flatMap((ext) => ['--external', ext]),
    ]

    if (watch) {
      tsupArgs.push('--watch')
    }

    console.log(``)
    console.log(`Building ${config.name ?? 'integration'}...`)
    console.log(`  Compute layer: ${computeLayer}`)
    console.log(`  Format: ${format}`)
    console.log(`  Externals: ${allExternals.join(', ')}`)
    console.log(``)

    // Spawn tsup via npx
    const tsup = spawn('npx', tsupArgs, {
      cwd,
      stdio: 'inherit',
      shell: true,
    })

    tsup.on('error', (error) => {
      console.error('Failed to start tsup:', error.message)
      process.exit(1)
    })

    tsup.on('close', (code) => {
      if (code === 0) {
        console.log(``)
        console.log(`Build completed successfully!`)
      }
      process.exit(code ?? 0)
    })
  } catch (error) {
    console.error(
      'Error loading config:',
      error instanceof Error ? error.message : String(error),
    )
    process.exit(1)
  }
}
