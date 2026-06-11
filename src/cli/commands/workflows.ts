import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { parse as parseYaml } from 'yaml'
import { parseArgs } from '../utils'
import { getCredentials, getServerUrl, callCliApi } from '../utils/auth'
import { validateWorkflowYAML } from '../../workflows/types'

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

interface WorkflowVersionResponse {
  id: string
  version: number | null
  versionLabel: string | null
  contentHash: string | null
  createdAt: string
  isTriggerVersion?: boolean
}

interface WorkflowResponse {
  id: string
  handle: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  triggerVersionId: string | null
  triggerVersion: number | null
  triggerVersionLabel: string | null
  versions?: WorkflowVersionResponse[]
}

interface WorkflowsListResponse {
  success: boolean
  workflows: WorkflowResponse[]
  error?: string
}

interface WorkflowGetResponse {
  success: boolean
  workflow: WorkflowResponse
  error?: string
}

interface DeployWorkflowResponse {
  success: boolean
  workflow: WorkflowResponse | null
  version: WorkflowVersionResponse | null
  isNew: boolean
  reusedVersion: boolean
  pendingBuild: boolean
  message?: string
  errors?: Record<string, { code: string; message: string }>
  error?: string
}

interface ValidateWorkflowResponse {
  success: boolean
  valid: boolean
  handle?: string
  name?: string
  errors?: Record<string, { code: string; message: string }>
  error?: string
}

interface WorkflowInputField {
  name: string
  type: string
  required: boolean
  description?: string
  label?: string
}

interface WorkflowSchemaResponse {
  handle: string
  name: string
  description?: string
  version: number
  versionId: string
  inputs: WorkflowInputField[]
  error?: string
}

interface RunWorkflowResponse {
  success: boolean
  workflowRunId: string
  status: string
  workflowId: string
  workflowVersionId: string
  version: number
  error?: string
}

interface WorkflowRunStatusResponse {
  success: boolean
  workflowRunId: string
  status: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  steps: Array<{
    id: string
    handle: string
    name: string
    status: string
    startedAt: string | null
    completedAt: string | null
  }>
  error?: string
}

type WorkflowRunTerminalStatus = 'completed' | 'failed' | 'cancelled'

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
skedyul workflows - Manage workplace workflows

Usage:
  skedyul workflows <command> [options]

Commands:
  list              List all workflows in a workplace
  get <handle>      Get details of a specific workflow
  versions <handle> List versions of a workflow
  deploy            Deploy a workflow from a YAML file
  validate          Validate a workflow YAML file
  pull <handle>     Download workflow YAML from the platform
  publish <handle>  Activate a version on the workflow trigger
  run <handle>      Run a workflow

List Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Get / Versions Options:
  --workplace, -w   Workplace subdomain (required)
  --json            Output as JSON

Deploy Options:
  --file, -f        Path to workflow YAML file
  --workplace, -w   Workplace subdomain (required)
  --draft           Deploy without activating on the trigger
  --label           Version label (e.g., "experiment-v2")
  --json            Output as JSON

Validate Options:
  --file, -f        Path to workflow YAML file
  --workplace, -w   Workplace subdomain (required for server validation)
  --json            Output as JSON

Pull Options:
  --workplace, -w   Workplace subdomain (required)
  --output, -o      Output file path (default: ./<handle>.workflow.yml)
  --version, -v     Version number (default: trigger version)
  --json            Output as JSON

Publish Options:
  --workplace, -w   Workplace subdomain (required)
  --version, -v     Version number to activate (required)
  --json            Output as JSON

Run Options:
  --workplace, -w   Workplace subdomain (required)
  --version, -v     Version number (default: trigger version)
  --input, -i       Input value in format key=value (can be repeated)
  --wait            Poll until the run completes
  --json            Output as JSON

Examples:
  skedyul workflows list -w gym-demo
  skedyul workflows get onboarding -w gym-demo
  skedyul workflows deploy -f ./onboarding.workflow.yml -w gym-demo
  skedyul workflows validate -f ./onboarding.workflow.yml -w gym-demo
  skedyul workflows run onboarding -w gym-demo --input contactId=con_abc --wait
  skedyul workflows publish onboarding -w gym-demo --version 2
`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureAuth(): { token: string; serverUrl: string } {
  const credentials = getCredentials()
  if (!credentials?.token) {
    console.error('Error: Not authenticated')
    console.error("Run 'skedyul auth login' to authenticate first.")
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

async function loadWorkflowFile(filePath: string): Promise<{ content: string }> {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`)
  }

  const content = fs.readFileSync(absolutePath, 'utf-8')
  const ext = path.extname(absolutePath).toLowerCase()

  if (ext !== '.yml' && ext !== '.yaml') {
    throw new Error('Workflow file must be a .yml or .yaml file')
  }

  let rawWorkflow: unknown
  try {
    rawWorkflow = parseYaml(content)
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`)
  }

  const validation = validateWorkflowYAML(rawWorkflow)
  if (!validation.success) {
    const errorMessages = validation.error.issues
      .map((e) => `  - ${String(e.path.join('.')) || '(root)'}: ${e.message}`)
      .join('\n')
    throw new Error(`Workflow validation failed:\n${errorMessages}`)
  }

  return { content }
}

function parseInputFlags(flags: Record<string, unknown>): Record<string, string> {
  const inputs: Record<string, string> = {}
  const inputFlags = flags.input || flags.i

  if (!inputFlags) {
    return inputs
  }

  const inputArray = Array.isArray(inputFlags) ? inputFlags : [inputFlags]
  for (const item of inputArray) {
    const value = String(item)
    const eqIndex = value.indexOf('=')
    if (eqIndex > 0) {
      inputs[value.slice(0, eqIndex)] = value.slice(eqIndex + 1)
    } else {
      throw new Error(`Invalid input format: ${value}. Expected key=value`)
    }
  }

  return inputs
}

function isTerminalRunStatus(status: string): status is WorkflowRunTerminalStatus {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  const result = await callCliApi<WorkflowsListResponse>(
    { serverUrl, token },
    '/workflows',
    undefined,
    { method: 'GET', query: { workplaceId: workplaceToken.workplaceId } },
  )

  if (!result.success) {
    throw new Error(result.error || 'Failed to list workflows')
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result.workflows, null, 2))
    return
  }

  console.log('')
  console.log(`Workflows in ${workplace}`)
  console.log('')

  if (result.workflows.length === 0) {
    console.log('  No workflows found.')
  } else {
    console.log('  Handle                      Name                          Active')
    console.log('  ──────────────────────────  ────────────────────────────  ───────')

    for (const workflow of result.workflows) {
      const handle = workflow.handle.slice(0, 26).padEnd(26)
      const name = workflow.name.slice(0, 28).padEnd(28)
      const active =
        workflow.triggerVersion !== null ? `v${workflow.triggerVersion}` : '-'
      console.log(`  ${handle}  ${name}  ${active.padStart(7)}`)
    }
  }

  console.log('')
}

async function handleGet(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)
  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle || !workplace) {
    console.error('Error: handle and --workplace are required')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  const result = await callCliApi<WorkflowGetResponse>(
    { serverUrl, token },
    '/workflows',
    undefined,
    {
      method: 'GET',
      query: { workplaceId: workplaceToken.workplaceId, handle },
    },
  )

  if (!result.success) {
    throw new Error(result.error || 'Failed to get workflow')
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result.workflow, null, 2))
    return
  }

  const workflow = result.workflow
  console.log('')
  console.log(`Workflow: ${workflow.name}`)
  console.log('')
  console.log(`  Handle:         ${workflow.handle}`)
  console.log(`  Description:    ${workflow.description || '-'}`)
  console.log(
    `  Trigger version: ${workflow.triggerVersion !== null ? `v${workflow.triggerVersion}` : '(none)'}`,
  )
  console.log('')

  if (workflow.versions && workflow.versions.length > 0) {
    console.log('  Versions:')
    console.log('    Version  Label                    Active  Created')
    console.log('    ───────  ───────────────────────  ──────  ────────────────────')
    for (const version of workflow.versions) {
      const label = (version.versionLabel || '-').slice(0, 23).padEnd(23)
      const active = version.isTriggerVersion ? 'Yes' : 'No'
      const created = new Date(version.createdAt).toLocaleDateString()
      console.log(
        `    v${String(version.version).padEnd(5)}  ${label}  ${active.padEnd(6)}  ${created}`,
      )
    }
    console.log('')
  }
}

async function handleVersions(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)
  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!handle || !workplace) {
    console.error('Error: handle and --workplace are required')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  const result = await callCliApi<WorkflowGetResponse>(
    { serverUrl, token },
    '/workflows',
    undefined,
    {
      method: 'GET',
      query: {
        workplaceId: workplaceToken.workplaceId,
        handle,
        action: 'versions',
      },
    },
  )

  if (!result.success) {
    throw new Error(result.error || 'Failed to list versions')
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result.workflow.versions ?? [], null, 2))
    return
  }

  const versions = result.workflow.versions ?? []
  console.log('')
  console.log(`Versions for ${handle}`)
  console.log('')

  if (versions.length === 0) {
    console.log('  No versions found.')
  } else {
    console.log('  Version  Label                    Active  Created')
    console.log('  ───────  ───────────────────────  ──────  ────────────────────')
    for (const version of versions) {
      const label = (version.versionLabel || '-').slice(0, 23).padEnd(23)
      const active = version.isTriggerVersion ? 'Yes' : 'No'
      const created = new Date(version.createdAt).toLocaleDateString()
      console.log(
        `  v${String(version.version).padEnd(5)}  ${label}  ${active.padEnd(6)}  ${created}`,
      )
    }
  }
  console.log('')
}

async function handleDeploy(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const filePath = (flags.file || flags.f) as string | undefined
  const workplace = (flags.workplace || flags.w) as string | undefined
  const draft = Boolean(flags.draft)
  const versionLabel = flags.label as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!filePath || !workplace) {
    console.error('Error: --file and --workplace are required')
    process.exit(1)
  }

  let content: string
  try {
    const loaded = await loadWorkflowFile(filePath)
    content = loaded.content
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (jsonOutput) {
      console.log(JSON.stringify({ error: message }))
    } else {
      console.error(`Error: ${message}`)
    }
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  const result = await callCliApi<DeployWorkflowResponse>(
    { serverUrl, token },
    '/workflows',
    {
      action: 'deploy',
      workplaceId: workplaceToken.workplaceId,
      yamlContent: content,
      publish: !draft,
      versionLabel,
    },
  )

  if (!result.success) {
    const message = result.error || 'Deploy failed'
    if (jsonOutput) {
      console.log(JSON.stringify(result))
    } else {
      console.error(`Error: ${message}`)
      if (result.errors) {
        for (const [key, err] of Object.entries(result.errors)) {
          if (err) {
            console.error(`  ${key}: ${err.message}`)
          }
        }
      }
    }
    process.exit(1)
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log('')
  if (result.reusedVersion) {
    console.log('No changes detected — reusing existing version.')
  } else if (result.isNew) {
    console.log(`Created workflow: ${result.workflow?.handle}`)
  } else {
    console.log(`Deployed new version: ${result.workflow?.handle}`)
  }

  if (result.version?.version !== null && result.version?.version !== undefined) {
    console.log(`  Version: v${result.version.version}`)
  }
  if (result.pendingBuild) {
    console.log('  Building compute image for function.invoke steps...')
  }
  if (!draft && result.version) {
    console.log('  Trigger version updated.')
  } else if (draft) {
    console.log('  Draft deploy — trigger version unchanged.')
  }
  console.log('')
}

async function handleValidate(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const filePath = (flags.file || flags.f) as string | undefined
  const workplace = (flags.workplace || flags.w) as string | undefined
  const jsonOutput = Boolean(flags.json)

  if (!filePath) {
    console.error('Error: --file is required')
    process.exit(1)
  }

  let content: string
  try {
    const loaded = await loadWorkflowFile(filePath)
    content = loaded.content
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (jsonOutput) {
      console.log(JSON.stringify({ valid: false, error: message }))
    } else {
      console.error(`Error: ${message}`)
    }
    process.exit(1)
  }

  if (!workplace) {
    if (jsonOutput) {
      console.log(JSON.stringify({ valid: true, message: 'Local validation passed' }))
    } else {
      console.log('Local validation passed.')
      console.log('Tip: pass --workplace for full server-side validation.')
    }
    return
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  const result = await callCliApi<ValidateWorkflowResponse>(
    { serverUrl, token },
    '/workflows',
    {
      action: 'validate',
      workplaceId: workplaceToken.workplaceId,
      yamlContent: content,
    },
  )

  if (!result.valid) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.error('Validation failed:')
      if (result.errors) {
        for (const [key, err] of Object.entries(result.errors)) {
          if (err) {
            console.error(`  ${key}: ${err.message}`)
          }
        }
      }
    }
    process.exit(1)
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Validation passed: ${result.name} (${result.handle})`)
  }
}

async function handlePull(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)
  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const output = (flags.output || flags.o) as string | undefined
  const version = flags.version || flags.v
  const jsonOutput = Boolean(flags.json)

  if (!handle || !workplace) {
    console.error('Error: handle and --workplace are required')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  const result = await callCliApi<{ success: boolean; yaml: string; version: number; handle: string }>(
    { serverUrl, token },
    '/workflows',
    undefined,
    {
      method: 'GET',
      query: {
        workplaceId: workplaceToken.workplaceId,
        handle,
        action: 'pull',
        version: version !== undefined ? String(version) : undefined,
      },
    },
  )

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const outputPath = path.resolve(output || `./${handle}.workflow.yml`)
  fs.writeFileSync(outputPath, result.yaml, 'utf-8')
  console.log(`Saved v${result.version} to ${outputPath}`)
}

async function handlePublish(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)
  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const version = flags.version || flags.v
  const jsonOutput = Boolean(flags.json)

  if (!handle || !workplace || version === undefined) {
    console.error('Error: handle, --workplace, and --version are required')
    process.exit(1)
  }

  const versionNumber = Number(version)
  if (Number.isNaN(versionNumber)) {
    console.error('Error: --version must be a number')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  const result = await callCliApi<{ success: boolean; workflowId: string; workflowVersionId: string; version: number }>(
    { serverUrl, token },
    '/workflows',
    {
      action: 'publish',
      workplaceId: workplaceToken.workplaceId,
      handle,
      version: versionNumber,
    },
  )

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(`Activated v${result.version} on trigger for ${handle}`)
}

async function promptForMissingInputs(
  schema: WorkflowSchemaResponse,
  inputs: Record<string, string>,
): Promise<Record<string, string>> {
  const missing = schema.inputs.filter(
    (input) => input.required && !inputs[input.name],
  )

  if (missing.length === 0) {
    return inputs
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const askQuestion = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer)
      })
    })

  const resolved = { ...inputs }

  try {
    for (const input of missing) {
      const description = input.description ? ` (${input.description})` : ''
      const answer = await askQuestion(
        `${input.label || input.name}${description}: `,
      )
      if (!answer.trim()) {
        throw new Error(`Required input missing: ${input.name}`)
      }
      resolved[input.name] = answer.trim()
    }
  } finally {
    rl.close()
  }

  return resolved
}

async function waitForWorkflowRun(
  serverUrl: string,
  token: string,
  workplaceId: string,
  workflowRunId: string,
): Promise<WorkflowRunStatusResponse> {
  while (true) {
    const status = await callCliApi<WorkflowRunStatusResponse>(
      { serverUrl, token },
      '/workflows/run',
      undefined,
      {
        method: 'GET',
        query: { workplaceId, workflowRunId },
      },
    )

    if (!status.success) {
      throw new Error(status.error || 'Failed to fetch workflow run status')
    }

    const runningSteps = status.steps.filter(
      (step) => step.status === 'RUNNING' || step.status === 'running',
    )
    const failedSteps = status.steps.filter(
      (step) => step.status === 'FAILED' || step.status === 'failed',
    )

    if (runningSteps.length > 0) {
      const names = runningSteps.map((step) => step.handle).join(', ')
      console.log(`  Running: ${names}`)
    }

    if (isTerminalRunStatus(status.status)) {
      if (status.status === 'completed') {
        console.log('  Workflow completed successfully.')
      } else if (status.status === 'failed') {
        console.error('  Workflow failed.')
        if (failedSteps.length > 0) {
          for (const step of failedSteps) {
            console.error(`    ${step.handle}: ${step.status}`)
          }
        }
      } else {
        console.error('  Workflow cancelled.')
      }
      return status
    }

    await sleep(2000)
  }
}

async function handleRun(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)
  const handle = positional[0]
  const workplace = (flags.workplace || flags.w) as string | undefined
  const version = flags.version || flags.v
  const wait = Boolean(flags.wait)
  const jsonOutput = Boolean(flags.json)

  if (!handle || !workplace) {
    console.error('Error: handle and --workplace are required')
    process.exit(1)
  }

  const { token, serverUrl } = ensureAuth()
  const workplaceToken = await getWorkplaceToken(workplace, serverUrl, token)

  let inputs: Record<string, string>
  try {
    inputs = parseInputFlags(flags)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`)
    process.exit(1)
  }

  const schema = await callCliApi<WorkflowSchemaResponse>(
    { serverUrl, token },
    '/workflow-schema',
    undefined,
    {
      method: 'GET',
      query: {
        workplaceId: workplaceToken.workplaceId,
        handle,
        version: version !== undefined ? String(version) : undefined,
      },
    },
  )

  if (schema.error) {
    throw new Error(schema.error)
  }

  try {
    inputs = await promptForMissingInputs(schema, inputs)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`)
    process.exit(1)
  }

  const runResult = await callCliApi<RunWorkflowResponse>(
    { serverUrl, token },
    '/workflows/run',
    {
      workplaceId: workplaceToken.workplaceId,
      handle,
      version: version !== undefined ? Number(version) : undefined,
      inputs,
    },
  )

  if (!runResult.success) {
    throw new Error(runResult.error || 'Failed to start workflow run')
  }

  if (jsonOutput && !wait) {
    console.log(JSON.stringify(runResult, null, 2))
    return
  }

  if (!jsonOutput) {
    console.log('')
    console.log(`Started workflow run: ${runResult.workflowRunId}`)
    console.log(`  Workflow: ${handle} (v${runResult.version})`)
    console.log('')
  }

  if (wait) {
    const finalStatus = await waitForWorkflowRun(
      serverUrl,
      token,
      workplaceToken.workplaceId,
      runResult.workflowRunId,
    )

    if (jsonOutput) {
      console.log(JSON.stringify(finalStatus, null, 2))
    }

    if (finalStatus.status === 'failed' || finalStatus.status === 'cancelled') {
      process.exit(1)
    }
    return
  }

  if (!jsonOutput) {
    console.log('Use --wait to poll until completion.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────────────

export async function workflowsCommand(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp()
    return
  }

  const command = args[0]
  const rest = args.slice(1)

  try {
    switch (command) {
      case 'list':
        await handleList(rest)
        break
      case 'get':
        await handleGet(rest)
        break
      case 'versions':
        await handleVersions(rest)
        break
      case 'deploy':
        await handleDeploy(rest)
        break
      case 'validate':
        await handleValidate(rest)
        break
      case 'pull':
        await handlePull(rest)
        break
      case 'publish':
        await handlePublish(rest)
        break
      case 'run':
        await handleRun(rest)
        break
      default:
        console.error(`Unknown workflows command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
