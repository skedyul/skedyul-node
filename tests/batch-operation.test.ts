import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { server } from '../src/index'
import type {
  BatchOperationRegistry,
  ServerlessServerInstance,
} from '../src/types'

function createBatchRegistry(
  overrides?: Partial<BatchOperationRegistry['import_members']>,
): BatchOperationRegistry {
  return {
    import_members: {
      handle: 'import_members',
      label: 'Import Members',
      entity: 'member',
      setup: async (ctx) => {
        return {
          state: {
            branchId: 'b1',
            glofoxKey: ctx.env.GLOFOX_API_KEY ?? null,
            requestToken: ctx.env.SKEDYUL_API_TOKEN ?? null,
          },
          total: 10,
          billing: { credits: 2 },
        }
      },
      iterate: async (ctx) => {
        return {
          items: [{ id: '1', envKey: ctx.env.GLOFOX_API_KEY }],
          pagination: { hasMore: false, nextCursor: undefined },
          state: ctx.state,
        }
      },
      ...overrides,
    },
  }
}

async function postBatchOperation(
  handler: ServerlessServerInstance['handler'],
  body: Record<string, unknown>,
) {
  const response = await handler({
    path: '/batch-operation',
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    queryStringParameters: null,
    requestContext: { requestId: 'batch-test' },
  })
  const parsed =
    typeof response.body === 'string' ? JSON.parse(response.body) : response.body
  return { statusCode: response.statusCode, body: parsed }
}

describe('batch-operation route', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    delete process.env.MCP_ENV
    delete process.env.MCP_ENV_JSON
    delete process.env.GLOFOX_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('returns NOT_FOUND soft failure when no batch ops registered', async () => {
    const instance = server.create({
      computeLayer: 'serverless',
      name: 'batch-test',
      version: '0.0.1',
      tools: {},
    }) as ServerlessServerInstance

    const { statusCode, body } = await postBatchOperation(instance.handler, {
      method: 'setup',
      handle: 'import_members',
      env: {},
      context: {
        workplaceId: 'wp_1',
        appInstallationId: 'inst_1',
        appId: 'app_1',
      },
    })

    assert.strictEqual(statusCode, 200)
    assert.strictEqual(body.success, false)
    assert.strictEqual(body.error.code, 'NOT_FOUND')
    assert.ok(body.billing)
  })

  test('merges baked MCP_ENV into ctx.env like tools', async () => {
    process.env.MCP_ENV_JSON = JSON.stringify({ GLOFOX_API_KEY: 'baked-key' })

    const instance = server.create({
      computeLayer: 'serverless',
      name: 'batch-test',
      version: '0.0.1',
      tools: {},
      batchOperations: createBatchRegistry(),
    }) as ServerlessServerInstance

    const { statusCode, body } = await postBatchOperation(instance.handler, {
      method: 'setup',
      handle: 'import_members',
      env: { SKEDYUL_API_TOKEN: 'sk_wkp_test' },
      context: {
        workplaceId: 'wp_1',
        appInstallationId: 'inst_1',
        appId: 'app_1',
        app: { id: 'app_1', versionId: 'ver_1' },
      },
    })

    assert.strictEqual(statusCode, 200)
    assert.strictEqual(body.success, true)
    assert.strictEqual(body.result.state.glofoxKey, 'baked-key')
    assert.strictEqual(body.result.state.requestToken, 'sk_wkp_test')
    assert.strictEqual(body.billing.credits, 2)
  })

  test('request env overrides baked env', async () => {
    process.env.MCP_ENV_JSON = JSON.stringify({ GLOFOX_API_KEY: 'baked-key' })

    const instance = server.create({
      computeLayer: 'serverless',
      name: 'batch-test',
      version: '0.0.1',
      tools: {},
      batchOperations: createBatchRegistry(),
    }) as ServerlessServerInstance

    const { body } = await postBatchOperation(instance.handler, {
      method: 'iterate',
      handle: 'import_members',
      env: {
        SKEDYUL_API_TOKEN: 'sk_wkp_test',
        GLOFOX_API_KEY: 'request-key',
      },
      context: {
        workplaceId: 'wp_1',
        appInstallationId: 'inst_1',
        appId: 'app_1',
      },
      limit: 10,
    })

    assert.strictEqual(body.success, true)
    assert.strictEqual(body.result.items[0].envKey, 'request-key')
    assert.strictEqual(body.billing.credits, 0)
  })

  test('domain-only iterate return gets default billing', async () => {
    const instance = server.create({
      computeLayer: 'serverless',
      name: 'batch-test',
      version: '0.0.1',
      tools: {},
      batchOperations: createBatchRegistry(),
    }) as ServerlessServerInstance

    const { body } = await postBatchOperation(instance.handler, {
      method: 'iterate',
      handle: 'import_members',
      env: {},
      context: {
        workplaceId: 'wp_1',
        appInstallationId: 'inst_1',
        appId: 'app_1',
      },
      limit: 5,
    })

    assert.strictEqual(body.success, true)
    assert.ok(Array.isArray(body.result.items))
    assert.deepStrictEqual(body.billing, { credits: 0 })
  })

  test('handler soft failure returns structured ToolError envelope', async () => {
    const instance = server.create({
      computeLayer: 'serverless',
      name: 'batch-test',
      version: '0.0.1',
      tools: {},
      batchOperations: createBatchRegistry({
        iterate: async () => ({
          success: false as const,
          error: {
            code: 'RATE_LIMITED',
            message: 'slow down',
            category: 'external',
          },
          retry: { allowed: true, afterMs: 1234 },
        }),
      }),
    }) as ServerlessServerInstance

    const { statusCode, body } = await postBatchOperation(instance.handler, {
      method: 'iterate',
      handle: 'import_members',
      env: {},
      context: {
        workplaceId: 'wp_1',
        appInstallationId: 'inst_1',
        appId: 'app_1',
      },
      limit: 5,
    })

    assert.strictEqual(statusCode, 200)
    assert.strictEqual(body.success, false)
    assert.strictEqual(body.error.code, 'RATE_LIMITED')
    assert.strictEqual(body.retry.afterMs, 1234)
    assert.strictEqual(body.billing.credits, 0)
  })
})
