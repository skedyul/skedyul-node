import * as fs from 'fs'
import * as path from 'path'
import { parse as parseYaml } from 'yaml'
import { parseArgs } from '../utils'
import { getCredentials, getServerUrl, callCliApi } from '../utils/auth'
import { SkillYAMLSchema, validateSkillYAML, type SkillYAML } from '../../skills/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WorkplaceTokenResponse {
  token: string
  expiresAt: string
  workplaceId: string
  workplaceName: string
  workplaceSubdomain: string
}

interface SkillVersionResponse {
  id: string
  version: number
  versionLabel: string | null
  isPublished: boolean
  contentHash: string | null
  createdAt: string
}

interface SkillResponse {
  id: string
  handle: string
  name: string
  description: string | null
  latestVersion: number | null
  createdAt: string
  updatedAt: string
  versions?: SkillVersionResponse[]
}

interface SkillsListResponse {
  success: boolean
  skills: SkillResponse[]
  error?: string
}

interface SkillGetResponse {
  success: boolean
  skill: SkillResponse
  error?: string
}

interface DeployResponse {
  success: boolean
  skill: {
    id: string
    handle: string
    name: string
  } | null
  version: SkillVersionResponse | null
  isNew: boolean
  reusedVersion: boolean
  message?: string
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
skedyul skills - Manage skills for workplaces

Usage:
  skedyul skills <command> [options]

Commands:
  list              List all skills in a workplace
  get <handle>      Get details of a specific skill
  deploy            Deploy a skill from a YAML file (creates or updates)
  publish           Publish a draft version
  versions          List versions of a skill
  delete            Delete a skill

List Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Get Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Deploy Options:
  --file, -f        Path to skill definition file (.skill.yml)
  --workplace, -w   Workplace subdomain (required)
  --draft           Deploy as draft (not published)
  --label           Version label (e.g., "experiment-shorter-prompts")
  --json            Output as JSON

Publish Options:
  --workplace, -w   Workplace subdomain (required)
  --version, -v     Version number to publish (required)
  --json            Output as JSON

Versions Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Delete Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Examples:
  skedyul skills list -w crux
  skedyul skills get sales-qualification -w crux
  skedyul skills deploy -f ./skills/sales-qualification.skill.yml -w crux
  skedyul skills deploy -f ./skills/sales-v2.skill.yml -w crux --draft
  skedyul skills publish sales-qualification -w crux -v 2
  skedyul skills versions sales-qualification -w crux
  skedyul skills delete sales-qualification -w crux
`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureAuth(): { token: string; serverUrl: string } {
  const credentials = getCredentials()
  if (!credentials) {
    console.error('Error: Not logged in. Run "skedyul login" first.')
    process.exit(1)
  }
  return { token: credentials.token, serverUrl: getServerUrl() }
}

async function getWorkplaceToken(
  workplaceSubdomain: string,
  serverUrl: string,
  cliToken: string,
): Promise<WorkplaceTokenResponse> {
  return callCliApi<WorkplaceTokenResponse>(
    { serverUrl, token: cliToken },
    '/workplace-token',
    { workplaceSubdomain },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// File loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadSkillFile(filePath: string): Promise<{ skill: SkillYAML; content: string }> {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`)
  }

  const content = fs.readFileSync(absolutePath, 'utf-8')
  const ext = path.extname(absolutePath).toLowerCase()

  if (ext !== '.yml' && ext !== '.yaml') {
    throw new Error('Skill file must be a .skill.yml or .skill.yaml file')
  }

  let rawSkill: unknown
  try {
    rawSkill = parseYaml(content)
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`)
  }

  const validation = validateSkillYAML(rawSkill)
  if (!validation.success) {
    const errorMessages = validation.error.issues
      .map((e) => `  - ${String(e.path.join('.')) || '(root)'}: ${e.message}`)
      .join('\n')
    throw new Error(`Skill validation failed:\n${errorMessages}`)
  }

  return { skill: validation.data, content }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function handleList(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul skills list --workplace crux')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()

  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/skills?workplaceId=${workplaceToken.workplaceId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as SkillsListResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to list skills')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result.skills, null, 2))
      return
    }

    console.log('')
    console.log(`Skills in ${workplace}`)
    console.log('')

    if (result.skills.length === 0) {
      console.log('  No skills found.')
    } else {
      console.log('  Handle                      Name                          Version')
      console.log('  ──────────────────────────  ────────────────────────────  ───────')

      for (const skill of result.skills) {
        const handle = skill.handle.slice(0, 26).padEnd(26)
        const name = skill.name.slice(0, 28).padEnd(28)
        const version = skill.latestVersion !== null ? `v${skill.latestVersion}` : '-'
        console.log(`  ${handle}  ${name}  ${version.padStart(7)}`)
      }
    }

    console.log('')
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

async function handleGet(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle) {
    console.error('Error: Skill handle is required')
    console.error('Usage: skedyul skills get <handle> --workplace crux')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul skills get <handle> --workplace crux')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()

  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/skills?workplaceId=${workplaceToken.workplaceId}&handle=${handle}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as SkillGetResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to get skill')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result.skill, null, 2))
      return
    }

    const skill = result.skill
    console.log('')
    console.log(`Skill: ${skill.name}`)
    console.log('')
    console.log(`  Handle:       ${skill.handle}`)
    console.log(`  Description:  ${skill.description || '-'}`)
    console.log(`  Created:      ${new Date(skill.createdAt).toLocaleString()}`)
    console.log(`  Updated:      ${new Date(skill.updatedAt).toLocaleString()}`)
    console.log('')
    console.log('  Versions:')
    if (!skill.versions || skill.versions.length === 0) {
      console.log('    (none)')
    } else {
      console.log('    Version  Label                    Published  Created')
      console.log('    ───────  ───────────────────────  ─────────  ────────────────────')
      for (const v of skill.versions) {
        const version = `v${v.version}`.padEnd(7)
        const label = (v.versionLabel || '-').slice(0, 23).padEnd(23)
        const published = v.isPublished ? 'Yes' : 'No'
        const created = new Date(v.createdAt).toLocaleDateString()
        console.log(`    ${version}  ${label}  ${published.padEnd(9)}  ${created}`)
      }
    }
    console.log('')
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

async function handleDeploy(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  const filePath = (flags.file || flags.f) as string | undefined
  const workplace = (flags.workplace || flags.w) as string | undefined
  const isDraft = Boolean(flags.draft)
  const versionLabel = flags.label as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!filePath) {
    console.error('Error: --file (-f) is required')
    console.error('Usage: skedyul skills deploy --file ./skill.yml --workplace crux')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul skills deploy --file ./skill.yml --workplace crux')
    process.exit(1)
  }

  let skill: SkillYAML
  let content: string
  try {
    const result = await loadSkillFile(filePath)
    skill = result.skill
    content = result.content
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()

  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  if (!jsonOutput) {
    console.log('')
    console.log(`Deploying skill "${skill.name}" to ${workplace}${isDraft ? ' (draft)' : ''}`)
    console.log('')
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/skills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'deploy',
        workplaceId: workplaceToken.workplaceId,
        yamlContent: content,
        publish: !isDraft,
        versionLabel,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string; details?: Array<{ path: string; message: string }> }
      if (errorData.details) {
        const detailsStr = errorData.details.map((d) => `  - ${d.path}: ${d.message}`).join('\n')
        throw new Error(`${errorData.error}\n${detailsStr}`)
      }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as DeployResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to deploy skill')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (result.reusedVersion) {
      console.log(`  No changes detected. Reusing version ${result.version?.version}.`)
    } else if (result.isNew) {
      console.log(`  Created new skill "${result.skill?.name}" (${result.skill?.handle})`)
      console.log(`  Version: ${result.version?.version} (${result.version?.isPublished ? 'published' : 'draft'})`)
    } else {
      console.log(`  Updated skill "${result.skill?.name}" (${result.skill?.handle})`)
      console.log(`  New version: ${result.version?.version} (${result.version?.isPublished ? 'published' : 'draft'})`)
    }
    console.log('')
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

async function handlePublish(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const version = (flags.version || flags.v) as string | number | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle) {
    console.error('Error: Skill handle is required')
    console.error('Usage: skedyul skills publish <handle> --workplace crux --version 2')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    process.exit(1)
  }

  if (version === undefined) {
    console.error('Error: --version (-v) is required')
    process.exit(1)
  }

  const versionNum = typeof version === 'string' ? parseInt(version, 10) : version
  if (isNaN(versionNum)) {
    console.error('Error: --version must be a number')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()

  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/skills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'publish',
        workplaceId: workplaceToken.workplaceId,
        handle,
        version: versionNum,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as { success: boolean; version?: SkillVersionResponse; error?: string }

    if (!result.success) {
      throw new Error(result.error || 'Failed to publish version')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log('')
    console.log(`  Published version ${result.version?.version} of skill "${handle}"`)
    console.log('')
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

async function handleVersions(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle) {
    console.error('Error: Skill handle is required')
    console.error('Usage: skedyul skills versions <handle> --workplace crux')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    process.exit(1)
  }

  // Reuse handleGet which includes versions
  await handleGet(args)
}

async function handleDelete(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle) {
    console.error('Error: Skill handle is required')
    console.error('Usage: skedyul skills delete <handle> --workplace crux')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()

  let workplaceToken: WorkplaceTokenResponse
  try {
    workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}` }))
    } else {
      console.error(`Error: Failed to get workplace token: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/skills?workplaceId=${workplaceToken.workplaceId}&handle=${handle}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as { success: boolean; deleted?: { id: string; handle: string; name: string }; error?: string }

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete skill')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log('')
    console.log(`  Deleted skill "${result.deleted?.name}" (${result.deleted?.handle})`)
    console.log('')
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function skillsCommand(args: string[]): Promise<void> {
  const command = args[0]
  const commandArgs = args.slice(1)

  switch (command) {
    case 'list':
      await handleList(commandArgs)
      break
    case 'get':
      await handleGet(commandArgs)
      break
    case 'deploy':
      await handleDeploy(commandArgs)
      break
    case 'publish':
      await handlePublish(commandArgs)
      break
    case 'versions':
      await handleVersions(commandArgs)
      break
    case 'delete':
      await handleDelete(commandArgs)
      break
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      break
    default:
      if (command) {
        console.error(`Unknown command: ${command}`)
      }
      printHelp()
      process.exit(command ? 1 : 0)
  }
}
