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
    computeLayer: 'serverless',  // 'serverless' -> ESM (.mjs), 'dedicated' -> CJS (.js)
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

function generateTsupConfig(
  format: 'esm' | 'cjs',
  externals: string[],
): string {
  const externalsStr = externals.map((e) => `'${e}'`).join(', ')
  
  // For ESM builds, use .mjs extension to ensure Lambda RIC correctly identifies module type
  // outExtension must be a function that returns an object
  const outExtension = format === 'esm' 
    ? `outExtension({ format }) {
    return { js: '.mjs' }
  },`
    : ''

  return `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server/mcp_server.ts'],
  format: ['${format}'],
  target: 'node22',
  outDir: 'dist/server',
  clean: true,
  splitting: false,
  dts: false,
  ${outExtension}
  external: [${externalsStr}],
})
`
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

  // Track if we created a temp config file
  const tempConfigPath = path.join(cwd, '.skedyul-tsup.config.mjs')
  let createdTempConfig = false

  try {
    const config = await loadConfig(configPath)

    // Determine format based on computeLayer from config
    const computeLayer = config.computeLayer ?? 'serverless'
    const format = computeLayer === 'serverless' ? 'esm' : 'cjs'

    // Build externals list
    const baseExternals = ['skedyul', `skedyul/${computeLayer}`, 'zod']
    const userExternals =
      config.build && 'external' in config.build
        ? (config.build.external as string[]) ?? []
        : []
    const allExternals = [...baseExternals, ...userExternals]

    // Check if user has their own tsup.config.ts
    const userTsupConfig = path.join(cwd, 'tsup.config.ts')
    const hasUserConfig = fs.existsSync(userTsupConfig)

    console.log(``)
    console.log(`Building ${config.name ?? 'integration'}...`)
    console.log(`  Compute layer: ${computeLayer}`)
    console.log(`  Format: ${format}`)
    console.log(`  Output: dist/server/mcp_server.${format === 'esm' ? 'mjs' : 'js'}`)
    console.log(`  Externals: ${allExternals.join(', ')}`)
    console.log(``)

    // Build tsup args
    let tsupArgs: string[]

    if (hasUserConfig) {
      // User has their own config, use it with CLI overrides
      // Note: outExtension cannot be set via CLI, so user config must handle it
      tsupArgs = [
        'tsup',
        '--config',
        userTsupConfig,
      ]
      if (watch) {
        tsupArgs.push('--watch')
      }
    } else {
      // Generate a temporary tsup config file
      const tsupConfigContent = generateTsupConfig(format, allExternals)
      fs.writeFileSync(tempConfigPath, tsupConfigContent, 'utf-8')
      createdTempConfig = true

      tsupArgs = [
        'tsup',
        '--config',
        tempConfigPath,
      ]
      if (watch) {
        tsupArgs.push('--watch')
      }
    }

    // Spawn tsup via npx
    const tsup = spawn('npx', tsupArgs, {
      cwd,
      stdio: 'inherit',
      shell: true,
    })

    tsup.on('error', (error) => {
      console.error('Failed to start tsup:', error.message)
      if (createdTempConfig && fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath)
      }
      process.exit(1)
    })

    tsup.on('close', (code) => {
      // Clean up temp config file
      if (createdTempConfig && fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath)
      }

      if (code === 0) {
        console.log(``)
        console.log(`Build completed successfully!`)
      }
      process.exit(code ?? 0)
    })
  } catch (error) {
    // Clean up temp config file on error
    if (createdTempConfig && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath)
    }
    console.error(
      'Error loading config:',
      error instanceof Error ? error.message : String(error),
    )
    process.exit(1)
  }
}
