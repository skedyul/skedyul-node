/**
 * skedyul config:export command
 *
 * Export the fully resolved config to .skedyul/config.json.
 * This is run during the Docker build to make the full config
 * (including provision with models, channels, pages) available at runtime.
 *
 * Usage:
 *   skedyul config:export              - Export to .skedyul/config.json
 *   skedyul config:export -o <path>    - Export to custom path
 */

import * as fs from 'fs'
import * as path from 'path'
import { CONFIG_FILE_NAMES } from '../../config/loader'
import { loadAndResolveConfig, serializeResolvedConfig } from '../../config/resolver'

function printHelp(): void {
  console.log(`
SKEDYUL CONFIG:EXPORT - Export resolved config to JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Resolves all dynamic imports in skedyul.config.ts and exports the full
config to a JSON file. This includes tools, webhooks, and provision config
(models, channels, pages, relationships).

USAGE
  $ skedyul config:export [options]

OPTIONS
  -o, --output <path>   Output path (default: .skedyul/config.json)
  --help, -h            Show this help message

EXAMPLES
  # Export to default location
  $ skedyul config:export

  # Export to custom path
  $ skedyul config:export -o dist/config.json

OUTPUT
  The exported JSON contains:
  - name, version, description, computeLayer
  - tools: Array of tool metadata (name, description, timeout, retries)
  - webhooks: Array of webhook metadata (name, description, methods, type)
  - provision: Full provision config (models, channels, pages, relationships)
  - agents: Agent definitions
`)
}

export async function configExportCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  // Parse output path option
  let outputPath = '.skedyul/config.json'
  const outputIndex = args.findIndex((arg) => arg === '-o' || arg === '--output')
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputPath = args[outputIndex + 1]
  }

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
    // Load and resolve all dynamic imports
    const resolvedConfig = await loadAndResolveConfig(configPath)

    // Serialize to JSON-safe format
    const serialized = serializeResolvedConfig(resolvedConfig)

    // Ensure output directory exists
    const outputDir = path.dirname(path.resolve(cwd, outputPath))
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Write the config file
    const fullOutputPath = path.resolve(cwd, outputPath)
    fs.writeFileSync(fullOutputPath, JSON.stringify(serialized, null, 2), 'utf-8')

    // Log summary
    console.log(``)
    console.log(`Config exported successfully!`)
    console.log(`  Output: ${outputPath}`)
    console.log(`  Name: ${serialized.name}`)
    console.log(`  Tools: ${serialized.tools?.length ?? 0}`)
    console.log(`  Webhooks: ${serialized.webhooks?.length ?? 0}`)
    console.log(`  Provision models: ${serialized.provision?.models?.length ?? 0}`)
    console.log(`  Provision channels: ${serialized.provision?.channels?.length ?? 0}`)
    console.log(`  Provision pages: ${serialized.provision?.pages?.length ?? 0}`)
    console.log(`  Agents: ${serialized.agents?.length ?? 0}`)
    console.log(``)
  } catch (error) {
    console.error(
      'Error exporting config:',
      error instanceof Error ? error.message : String(error),
    )
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}
