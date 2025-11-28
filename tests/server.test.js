const { test } = require('node:test')
const assert = require('node:assert/strict')
const { server } = require('../dist/index.js')

function createEchoRegistry() {
  return {
    'echo': async ({ input, context }) => {
      const value = String(input?.value ?? 'missing')
      const credits = value.length

      return {
        output: {
          message:
            context.mode === 'estimate'
              ? `estimate:${value}`
              : `echo:${value}`,
          envSnapshot: { ...context.env },
        },
        billing: {
          credits,
        },
      }
    },
  }
}

test('dedicated server exposes listen + health APIs', () => {
  const instance = server.create(
    {
      computeLayer: 'dedicated',
      metadata: {
        name: 'skedyul-test',
        version: '0.0.1',
      },
    },
    createEchoRegistry(),
  )

  assert.strictEqual(typeof instance.listen, 'function')
  assert.strictEqual(typeof instance.getHealthStatus, 'function')

  const snapshot = instance.getHealthStatus()
  assert.strictEqual(snapshot.status, 'running')
  assert.strictEqual(snapshot.runtime, 'dedicated')
  assert.ok(Array.isArray(snapshot.tools))
  assert.deepStrictEqual(snapshot.tools, ['echo'])
})

test('serverless handler responds to MCP calls and health checks', async () => {
  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'handler-test',
        version: '0.0.1',
      },
    },
    createEchoRegistry(),
  )

  const { handler } = serverless

  const toolCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'echo',
      arguments: {
        inputs: { value: 'hi' },
      },
    },
  }

  const callResponse = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify(toolCall),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'abc' },
  })

  assert.strictEqual(callResponse.statusCode, 200)
  const parsedResult = JSON.parse(callResponse.body)
  assert.deepStrictEqual(parsedResult.jsonrpc, '2.0')
  assert.deepStrictEqual(parsedResult.id, toolCall.id)
  assert.ok(parsedResult.result)
  assert.ok(Array.isArray(parsedResult.result.content))
  assert.strictEqual(parsedResult.result.billing.credits, 2)

  const healthResponse = await handler({
    path: '/health',
    httpMethod: 'GET',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'health' },
  })

  assert.strictEqual(healthResponse.statusCode, 200)
  const parsedHealth = JSON.parse(healthResponse.body)
  assert.strictEqual(parsedHealth.requests, 1)
  assert.strictEqual(parsedHealth.runtime, 'serverless')

  const listResponse = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'list' },
  })

  assert.strictEqual(listResponse.statusCode, 200)
  const parsedList = JSON.parse(listResponse.body)
  assert.ok(parsedList.result.tools.some((tool) => tool.name === 'echo'))
})

test('serverless estimate endpoint returns billing data', async () => {
  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'handler-estimate-test',
        version: '0.0.1',
      },
    },
    createEchoRegistry(),
  )

  const { handler } = serverless

  const estimateResponse = await handler({
    path: '/estimate',
    httpMethod: 'POST',
    body: JSON.stringify({
      name: 'echo',
      inputs: {
        value: 'hi-est',
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'estimate' },
  })

  assert.strictEqual(estimateResponse.statusCode, 200)
  const parsedEstimate = JSON.parse(estimateResponse.body)
  assert.strictEqual(parsedEstimate.billing.credits, 6)
})

test('serverless handler returns parse error on invalid payload', async () => {
  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'parse-error',
        version: '0.0.1',
      },
    },
    createEchoRegistry(),
  )

  const { handler } = serverless

  const response = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: '{ invalid json',
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'bad-json' },
  })

  assert.strictEqual(response.statusCode, 400)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, -32700)
})

