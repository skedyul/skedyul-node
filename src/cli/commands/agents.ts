import * as fs from 'fs'
import * as path from 'path'
import { parse as parseYaml } from 'yaml'
import { parseArgs } from '../utils'
import { getCredentials, getServerUrl, callCliApi } from '../utils/auth'
import {
  AgentSchemaZ,
  validateAgentSchema,
  type AgentSchema,
  isMultiStageAgent,
} from '../../schemas/agent-schema'

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

interface AgentTool {
  id: string
  name: string
  displayName: string
}

interface AgentResponse {
  id: string
  handle: string | null
  name: string
  description: string
  system: string
  personaName: string | null
  persona: string | null
  llmModelId: string
  llmModelName: string
  isEnabled: boolean
  isDefault: boolean
  kind: string
  tools: AgentTool[]
  createdAt: string
  updatedAt: string
}

interface AgentsListResponse {
  success: boolean
  agents: AgentResponse[]
  error?: string
}

interface AgentGetResponse {
  success: boolean
  agent: AgentResponse
  error?: string
}

interface AgentOperationResponse {
  success: boolean
  agent: AgentResponse | null
  error?: string
}

interface AgentVersionResponse {
  id: string
  version: number
  versionLabel: string
  isPublished: boolean
  trafficWeight: number
  contentHash: string
  createdAt: string
}

interface AgentVersionsResponse {
  success: boolean
  versions: AgentVersionResponse[]
  error?: string
}

interface DeployAgentResponse {
  id: string
  handle: string | null
  name: string
  description: string
  llmModelId: string
  llmModelName: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
  tools?: AgentTool[]
}

interface DeployResponse {
  success: boolean
  agent: DeployAgentResponse | null
  version: AgentVersionResponse | null
  isNew: boolean
  reusedVersion: boolean
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
skedyul agents - Manage agents for workplaces

Usage:
  skedyul agents <command> [options]

Commands:
  list              List all agents in a workplace
  get <handle>      Get details of a specific agent
  deploy            Deploy an agent from a YAML/JSON file (creates or updates)
  publish           Publish a draft version
  versions          List versions of an agent
  ab                Set A/B testing traffic weights
  rollback          Rollback to a previous version

List Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Get Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Deploy Options:
  --file, -f        Path to agent definition file (.agent.yml or .agent.json)
  --workplace, -w   Workplace subdomain (required)
  --draft           Deploy as draft (not published)
  --json            Output as JSON

Publish Options:
  --workplace, -w   Workplace subdomain (required)
  --version, -v     Version number to publish (default: latest draft)
  --weight          Traffic weight (0-100, default: 100)
  --json            Output as JSON

Versions Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

A/B Testing Options:
  --workplace, -w   Workplace subdomain (required)
  --v1              Traffic weight for version 1 (0-100)
  --v2              Traffic weight for version 2 (0-100)
  --json            Output as JSON

Rollback Options:
  --workplace, -w   Workplace subdomain (required)
  --to              Version number to rollback to
  --json            Output as JSON

Examples:
  # List all agents in a workplace
  skedyul agents list --workplace gym-demo

  # Get details of a specific agent
  skedyul agents get sales-agent --workplace gym-demo

  # Deploy an agent from YAML (creates new version)
  skedyul agents deploy --file ./sales-agent.agent.yml --workplace gym-demo

  # Deploy as draft (not published)
  skedyul agents deploy --file ./sales-agent.agent.yml --workplace gym-demo --draft

  # Publish a draft version
  skedyul agents publish sales-agent --workplace gym-demo --version 2

  # List versions
  skedyul agents versions sales-agent --workplace gym-demo

  # Set A/B testing weights (80% v1, 20% v2)
  skedyul agents ab sales-agent --workplace gym-demo --v1 80 --v2 20

  # Rollback to previous version
  skedyul agents rollback sales-agent --workplace gym-demo --to 1
`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function ensureAuth(): { token: string; serverUrl: string } {
  const credentials = getCredentials()
  if (!credentials?.token) {
    console.error('Error: Not authenticated')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }
  return { token: credentials.token, serverUrl: getServerUrl() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent File Loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadAgentFile(filePath: string): Promise<{ agent: AgentSchema; content: string }> {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Agent file not found: ${absolutePath}`)
  }

  const content = fs.readFileSync(absolutePath, 'utf-8')
  const isJson = absolutePath.endsWith('.json')
  const isYaml = absolutePath.endsWith('.yml') || absolutePath.endsWith('.yaml')

  let rawAgent: unknown

  if (isJson) {
    rawAgent = JSON.parse(content)
  } else if (isYaml) {
    rawAgent = parseYaml(content)
  } else {
    throw new Error(
      `Unsupported agent file format: ${path.extname(absolutePath)}. Use .agent.yml or .agent.json`,
    )
  }

  const validation = validateAgentSchema(rawAgent)
  if (!validation.success) {
    const errorMessages = validation.errors
      ?.map((e) => `  - ${e.path}: ${e.message}`)
      .join('\n')
    throw new Error(`Agent validation failed:\n${errorMessages}`)
  }

  return { agent: validation.data!, content }
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
    console.error('Usage: skedyul agents list --workplace gym-demo')
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
    const response = await fetch(`${serverUrl}/api/cli/agents?workplaceId=${workplaceToken.workplaceId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as AgentsListResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to list agents')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result.agents, null, 2))
      return
    }

    console.log('')
    console.log(`Agents in ${workplace}`)
    console.log('')

    if (result.agents.length === 0) {
      console.log('  No agents found.')
    } else {
      console.log('  Handle                Name                    Tools   Enabled')
      console.log('  ────────────────────  ──────────────────────  ──────  ───────')

      for (const agent of result.agents) {
        const handle = (agent.handle || '-').padEnd(20)
        const name = agent.name.slice(0, 22).padEnd(22)
        const tools = String(agent.tools.length).padStart(6)
        const enabled = agent.isEnabled ? 'Yes' : 'No'
        console.log(`  ${handle}  ${name}  ${tools}  ${enabled.padStart(7)}`)
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
    console.error('Error: Agent handle is required')
    console.error('Usage: skedyul agents get <handle> --workplace gym-demo')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul agents get <handle> --workplace gym-demo')
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
    const response = await fetch(`${serverUrl}/api/cli/agents?workplaceId=${workplaceToken.workplaceId}&handle=${handle}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as AgentGetResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to get agent')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result.agent, null, 2))
      return
    }

    const agent = result.agent
    console.log('')
    console.log(`Agent: ${agent.name}`)
    console.log('')
    console.log(`  Handle:       ${agent.handle || '-'}`)
    console.log(`  Description:  ${agent.description}`)
    console.log(`  LLM Model:    ${agent.llmModelName} (${agent.llmModelId})`)
    console.log(`  Enabled:      ${agent.isEnabled ? 'Yes' : 'No'}`)
    console.log(`  Default:      ${agent.isDefault ? 'Yes' : 'No'}`)
    console.log(`  Kind:         ${agent.kind}`)
    if (agent.personaName) {
      console.log(`  Persona:      ${agent.personaName}`)
    }
    console.log('')
    console.log('  Tools:')
    if (agent.tools.length === 0) {
      console.log('    (none)')
    } else {
      for (const tool of agent.tools) {
        console.log(`    - ${tool.displayName} (${tool.name})`)
      }
    }
    console.log('')
    console.log('  System Prompt:')
    console.log('  ─────────────────────────────────────────────────────────────')
    const systemLines = agent.system.split('\n')
    for (const line of systemLines.slice(0, 10)) {
      console.log(`  ${line}`)
    }
    if (systemLines.length > 10) {
      console.log(`  ... (${systemLines.length - 10} more lines)`)
    }
    if (agent.persona) {
      console.log('')
      console.log('  Persona Prompt:')
      console.log('  ─────────────────────────────────────────────────────────────')
      const personaLines = agent.persona.split('\n')
      for (const line of personaLines.slice(0, 10)) {
        console.log(`  ${line}`)
      }
      if (personaLines.length > 10) {
        console.log(`  ... (${personaLines.length - 10} more lines)`)
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

async function handleCreate(args: string[]): Promise<void> {
  // Redirect to deploy command
  console.log('Note: "create" is deprecated. Use "deploy" instead.')
  await handleDeploy(args)
}

async function handleUpdate(args: string[]): Promise<void> {
  // Redirect to deploy command
  console.log('Note: "update" is deprecated. Use "deploy" instead.')
  await handleDeploy(args)
}

async function handleDeploy(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)

  const filePath = (flags.file || flags.f) as string | undefined
  const workplace = (flags.workplace || flags.w) as string | undefined
  const isDraft = Boolean(flags.draft)
  const jsonOutput = Boolean(flags.json)

  if (!filePath) {
    console.error('Error: --file (-f) is required')
    console.error('Usage: skedyul agents deploy --file ./agent.yml --workplace gym-demo')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    console.error('Usage: skedyul agents deploy --file ./agent.yml --workplace gym-demo')
    process.exit(1)
  }

  let agent: AgentSchema
  let content: string
  try {
    const result = await loadAgentFile(filePath)
    agent = result.agent
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
    const agentType = isMultiStageAgent(agent) ? 'multi-stage' : 'single-stage'
    console.log('')
    console.log(`Deploying ${agentType} agent "${agent.name}" to ${workplace}${isDraft ? ' (draft)' : ''}`)
    console.log('')
  }

  try {
    const response = await fetch(`${serverUrl}/api/cli/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workplaceId: workplaceToken.workplaceId,
        subdomain: workplaceToken.workplaceSubdomain,
        action: 'deploy',
        yamlContent: content,
        publish: !isDraft,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as DeployResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to deploy agent')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (result.reusedVersion) {
      console.log(`Agent "${agent.name}" unchanged (content hash matches existing version)`)
    } else if (result.isNew) {
      console.log(`Agent "${agent.name}" created successfully!`)
    } else {
      console.log(`Agent "${agent.name}" updated successfully!`)
    }

    if (result.version) {
      console.log(`  Version:   ${result.version.versionLabel}`)
      console.log(`  Published: ${result.version.isPublished ? 'Yes' : 'No (draft)'}`)
      if (result.version.isPublished) {
        console.log(`  Traffic:   ${result.version.trafficWeight}%`)
      }
    }

    if (result.agent) {
      console.log(`  Handle:    ${result.agent.handle}`)
      if (result.agent.tools) {
        console.log(`  Tools:     ${result.agent.tools.length} bound`)
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

async function handlePublish(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const versionNum = (flags.version || flags.v) as string | undefined
  const weight = (flags.weight as string) ?? '100'
  const jsonOutput = Boolean(flags.json)

  if (!handle) {
    console.error('Error: Agent handle is required')
    console.error('Usage: skedyul agents publish <handle> --workplace gym-demo')
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
    const response = await fetch(`${serverUrl}/api/cli/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workplaceId: workplaceToken.workplaceId,
        action: 'publish',
        handle,
        version: versionNum ? parseInt(versionNum, 10) : undefined,
        trafficWeight: parseInt(weight, 10),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as { success: boolean; version?: AgentVersionResponse; error?: string }

    if (!result.success) {
      throw new Error(result.error || 'Failed to publish version')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log('')
    console.log(`Published ${handle} ${result.version?.versionLabel} with ${weight}% traffic`)
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
    console.error('Error: Agent handle is required')
    console.error('Usage: skedyul agents versions <handle> --workplace gym-demo')
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
    const response = await fetch(`${serverUrl}/api/cli/agents?workplaceId=${workplaceToken.workplaceId}&handle=${handle}&action=versions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as AgentVersionsResponse

    if (!result.success) {
      throw new Error(result.error || 'Failed to list versions')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result.versions, null, 2))
      return
    }

    console.log('')
    console.log(`Versions of ${handle}`)
    console.log('')

    if (result.versions.length === 0) {
      console.log('  No versions found.')
    } else {
      console.log('  Version   Published   Traffic   Created')
      console.log('  ────────  ──────────  ────────  ───────────────────')

      for (const version of result.versions) {
        const v = version.versionLabel.padEnd(8)
        const pub = (version.isPublished ? 'Yes' : 'No').padEnd(10)
        const traffic = `${version.trafficWeight}%`.padStart(8)
        const created = new Date(version.createdAt).toLocaleDateString()
        console.log(`  ${v}  ${pub}  ${traffic}  ${created}`)
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

async function handleAB(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const v1Weight = flags.v1 as string | undefined
  const v2Weight = flags.v2 as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle) {
    console.error('Error: Agent handle is required')
    console.error('Usage: skedyul agents ab <handle> --workplace gym-demo --v1 80 --v2 20')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    process.exit(1)
  }

  if (!v1Weight || !v2Weight) {
    console.error('Error: --v1 and --v2 weights are required')
    console.error('Usage: skedyul agents ab <handle> --workplace gym-demo --v1 80 --v2 20')
    process.exit(1)
  }

  const w1 = parseInt(v1Weight, 10)
  const w2 = parseInt(v2Weight, 10)

  if (w1 + w2 !== 100) {
    console.error(`Error: Traffic weights must sum to 100 (got ${w1 + w2})`)
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
    const response = await fetch(`${serverUrl}/api/cli/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workplaceId: workplaceToken.workplaceId,
        action: 'ab',
        handle,
        weights: [
          { version: 1, weight: w1 },
          { version: 2, weight: w2 },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as { success: boolean; error?: string }

    if (!result.success) {
      throw new Error(result.error || 'Failed to set A/B weights')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log('')
    console.log(`A/B testing configured for ${handle}:`)
    console.log(`  v1: ${w1}%`)
    console.log(`  v2: ${w2}%`)
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

async function handleRollback(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const toVersion = flags.to as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle) {
    console.error('Error: Agent handle is required')
    console.error('Usage: skedyul agents rollback <handle> --workplace gym-demo --to 1')
    process.exit(1)
  }

  if (!workplace) {
    console.error('Error: --workplace (-w) is required')
    process.exit(1)
  }

  if (!toVersion) {
    console.error('Error: --to version is required')
    console.error('Usage: skedyul agents rollback <handle> --workplace gym-demo --to 1')
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
    const response = await fetch(`${serverUrl}/api/cli/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workplaceId: workplaceToken.workplaceId,
        action: 'rollback',
        handle,
        toVersion: parseInt(toVersion, 10),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const result = await response.json() as { success: boolean; version?: AgentVersionResponse; error?: string }

    if (!result.success) {
      throw new Error(result.error || 'Failed to rollback')
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log('')
    console.log(`Rolled back ${handle} to v${toVersion}`)
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
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

export async function agentsCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printHelp()
    return
  }

  const subArgs = args.slice(1)

  switch (subcommand) {
    case 'list':
      await handleList(subArgs)
      break
    case 'get':
      await handleGet(subArgs)
      break
    case 'create':
      await handleCreate(subArgs)
      break
    case 'update':
      await handleUpdate(subArgs)
      break
    case 'deploy':
      await handleDeploy(subArgs)
      break
    case 'publish':
      await handlePublish(subArgs)
      break
    case 'versions':
      await handleVersions(subArgs)
      break
    case 'ab':
      await handleAB(subArgs)
      break
    case 'rollback':
      await handleRollback(subArgs)
      break
    default:
      console.error(`Error: Unknown subcommand: ${subcommand}`)
      console.error("Run 'skedyul agents --help' for usage information.")
      process.exit(1)
  }
}
