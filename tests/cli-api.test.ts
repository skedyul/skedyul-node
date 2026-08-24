import { test, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  approveMigration,
  deployWorkflow,
  diffSchema,
  listModels,
  listWorkplaces,
  pushSchema,
  validateWorkflow,
  validateWorkflowContent,
  type CliContext,
} from '../src/cli/api'

afterEach(() => {
  mock.reset()
})

const ctx: CliContext = {
  token: 'sk_cli_test',
  serverUrl: 'https://admin.skedyul.it',
}

type FetchCall = {
  url: string
  method: string
  body: unknown
}

function mockFetchSequence(
  responses: Array<{ status?: number; json: unknown }>,
): FetchCall[] {
  const calls: FetchCall[] = []
  let i = 0
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let body: unknown
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body,
    })
    const next = responses[i] ?? responses[responses.length - 1]
    i += 1
    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      async text() {
        return JSON.stringify(next.json)
      },
      async json() {
        return next.json
      },
    } as Response
  })
  return calls
}

const workplaceToken = {
  token: 'sk_cli_wkp_test',
  expiresAt: new Date().toISOString(),
  workplaceId: 'wp_1',
  workplaceName: 'Demo',
  workplaceSubdomain: 'gym-demo',
}

test('listWorkplaces GETs /api/cli/workplaces', async () => {
  const calls = mockFetchSequence([
    { json: { workplaces: [{ id: 'wp_1', name: 'Demo', subdomain: 'gym-demo' }] } },
  ])
  const workplaces = await listWorkplaces(ctx)
  assert.equal(calls[0].url, 'https://admin.skedyul.it/api/cli/workplaces')
  assert.equal(calls[0].method, 'GET')
  assert.equal(workplaces[0].subdomain, 'gym-demo')
})

test('listModels exchanges workplace token then GETs crm-models', async () => {
  const calls = mockFetchSequence([
    { json: workplaceToken },
    {
      json: {
        success: true,
        models: [{ id: 'm1', handle: 'lead', name: 'Lead', fieldCount: 2, instanceCount: 3 }],
      },
    },
  ])
  const models = await listModels(ctx, 'gym-demo')
  assert.equal(calls[0].url, 'https://admin.skedyul.it/api/cli/workplace-token')
  assert.deepEqual(calls[0].body, { workplaceSubdomain: 'gym-demo' })
  assert.ok(calls[1].url.includes('/api/cli/crm-models?workplaceId=wp_1'))
  assert.equal(models[0].handle, 'lead')
})

test('diffSchema posts crm-schema with dryRun true', async () => {
  const calls = mockFetchSequence([
    { json: workplaceToken },
    { json: { success: true, requiresApproval: false, hasChanges: false, impacts: [] } },
  ])
  const schema = {
    $schema: 'https://skedyul.com/schemas/crm/v1.json',
    name: 'Gym',
    description: '',
    models: [],
  }
  await diffSchema(ctx, 'gym-demo', schema as never)
  const body = calls[1].body as { dryRun: boolean; workplaceId: string }
  assert.equal(calls[1].url, 'https://admin.skedyul.it/api/cli/crm-schema')
  assert.equal(body.dryRun, true)
  assert.equal(body.workplaceId, 'wp_1')
})

test('pushSchema with autoApprove calls /approve-migration not /crm-schema/approve', async () => {
  const calls = mockFetchSequence([
    { json: workplaceToken },
    {
      json: {
        success: true,
        requiresApproval: true,
        migrationId: 'mig_1',
        impacts: [{ isDestructive: true }],
      },
    },
    { json: { success: true } },
  ])
  const schema = {
    $schema: 'https://skedyul.com/schemas/crm/v1.json',
    name: 'Gym',
    description: '',
    models: [],
  }
  const result = await pushSchema(ctx, 'gym-demo', schema as never, { autoApprove: true })
  assert.equal(calls[2].url, 'https://admin.skedyul.it/api/cli/approve-migration')
  assert.deepEqual(calls[2].body, { migrationId: 'mig_1' })
  assert.equal(result.requiresApproval, false)
})

test('approveMigration posts /approve-migration', async () => {
  const calls = mockFetchSequence([{ json: { success: true } }])
  await approveMigration(ctx, 'mig_9')
  assert.equal(calls[0].url, 'https://admin.skedyul.it/api/cli/approve-migration')
  assert.deepEqual(calls[0].body, { migrationId: 'mig_9' })
})

test('validateWorkflowContent accepts platform workflow YAML with typed steps', () => {
  const yaml = [
    'name: Test Send Thread Message',
    'handle: test-send-thread-message',
    'inputs:',
    '  thread-id:',
    '    label: Thread ID',
    '    required: true',
    '    type: id',
    'steps:',
    '  send-message:',
    '    type: task',
    '    service:',
    '      name: skedyul/threads',
    '      cmd: message.send',
    '    inputs:',
    '      thread-id: "{{ inputs.thread-id }}"',
    '',
  ].join('\n')

  const result = validateWorkflowContent(yaml)
  assert.equal(result.content, yaml)
})

test('validateWorkflow rejects invalid YAML locally before any HTTP call', async () => {
  const calls = mockFetchSequence([])
  await assert.rejects(
    () => validateWorkflow(ctx, 'gym-demo', 'this: [is: not: valid'),
    /Failed to parse YAML|Workflow validation failed/,
  )
  assert.equal(calls.length, 0)
})

test('deployWorkflow posts action deploy with yamlContent', async () => {
  const yaml = [
    'handle: onboarding',
    'name: Onboarding',
    'steps:',
    '  start:',
    '    service: core',
    '    cmd: noop',
    '',
  ].join('\n')
  const calls = mockFetchSequence([
    { json: workplaceToken },
    {
      json: {
        success: true,
        workflow: { handle: 'onboarding' },
        version: { version: 1 },
        isNew: true,
        reusedVersion: false,
        pendingBuild: false,
      },
    },
  ])

  const result = await deployWorkflow(ctx, 'gym-demo', yaml, { publish: true })
  const body = calls[1].body as { action: string; yamlContent: string; publish: boolean }
  assert.equal(calls[1].url, 'https://admin.skedyul.it/api/cli/workflows')
  assert.equal(body.action, 'deploy')
  assert.equal(body.publish, true)
  assert.equal(body.yamlContent, yaml)
  assert.equal(result.success, true)
})
