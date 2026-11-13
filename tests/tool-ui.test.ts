import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod/v4'
import { server, normalizeToolUi } from '../src/index'
import { buildToolMetadata } from '../src/server/tool-handler'
import { serializeConfig } from '../src/server/config-serializer'
import { serializeResolvedConfig } from '../src/config/resolver'
import type { ServerlessServerInstance, ToolRegistry, ToolUiConfig } from '../src/types'

function createRegistry(): ToolRegistry {
  return {
    checkAvailability: {
      name: 'check_availability',
      description: 'Check availability for a class',
      ui: {
        title: 'Checked availability',
        activeTitle: 'Checking availability',
        targetArg: 'className',
      },
      inputSchema: z.object({ className: z.string() }),
      handler: async () => ({ output: { ok: true }, billing: { credits: 0 } }),
    },
    computeSecret: {
      name: 'compute_secret',
      description: 'Opaque tool',
      ui: { title: 'Worked it out', opaque: true },
      inputSchema: z.object({}),
      handler: async () => ({ output: {}, billing: { credits: 0 } }),
    },
    plain: {
      name: 'plain',
      description: 'No ui declared',
      inputSchema: z.object({}),
      handler: async () => ({ output: {}, billing: { credits: 0 } }),
    },
  }
}

const expectedUi: Record<string, ToolUiConfig | undefined> = {
  check_availability: {
    title: 'Checked availability',
    activeTitle: 'Checking availability',
    targetArg: 'className',
  },
  compute_secret: { title: 'Worked it out', opaque: true },
  plain: undefined,
}

function uiByName(tools: Array<{ name: string; ui?: unknown }>) {
  return Object.fromEntries(tools.map((t) => [t.name, t.ui]))
}

test('normalizeToolUi keeps known fields and drops invalid ones', () => {
  assert.deepStrictEqual(
    normalizeToolUi({
      title: '  Searched contacts ',
      activeTitle: 'Searching contacts',
      targetArg: 'query',
      opaque: true,
      extra: 'ignored',
    }),
    {
      title: 'Searched contacts',
      activeTitle: 'Searching contacts',
      targetArg: 'query',
      opaque: true,
    },
  )
  assert.deepStrictEqual(normalizeToolUi({ title: 'x', opaque: false }), { title: 'x' })
  assert.deepStrictEqual(normalizeToolUi({ opaque: 'yes', title: 42 }), undefined)
  assert.strictEqual(normalizeToolUi({ title: '   ' }), undefined)
  assert.strictEqual(normalizeToolUi(undefined), undefined)
  assert.strictEqual(normalizeToolUi(null), undefined)
  assert.strictEqual(normalizeToolUi(['title']), undefined)
  assert.strictEqual(normalizeToolUi('Checked'), undefined)
})

test('buildToolMetadata includes ui only when declared', () => {
  const tools = buildToolMetadata(createRegistry())
  assert.deepStrictEqual(uiByName(tools), expectedUi)
  const plain = tools.find((t) => t.name === 'plain')
  assert.ok(plain)
  assert.ok(!('ui' in plain), 'tools without ui should not carry the key')
})

test('MCP tools/list returns tool ui', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'tool-ui-list',
    version: '0.0.1',
    tools: createRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'tool-ui-list' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.deepStrictEqual(uiByName(parsed.result.tools), expectedUi)
})

test('/config endpoint serialises tool ui', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'tool-ui-config',
    version: '0.0.1',
    tools: createRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/config',
    httpMethod: 'GET',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'tool-ui-config' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.deepStrictEqual(uiByName(parsed.tools), expectedUi)
})

test('serializeConfig and serializeResolvedConfig include tool ui', () => {
  const registry = createRegistry()
  const fromRuntime = serializeConfig({ name: 'app', tools: registry })
  const fromBuild = serializeResolvedConfig({ name: 'app', tools: registry })
  assert.deepStrictEqual(uiByName(fromRuntime.tools ?? []), expectedUi)
  assert.deepStrictEqual(uiByName(fromBuild.tools ?? []), expectedUi)
})
