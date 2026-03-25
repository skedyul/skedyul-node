import { test } from 'node:test'
import assert from 'node:assert/strict'
import { server } from '../src/index'
import { z } from 'zod/v4'
import type {
  DedicatedServerInstance,
  ServerlessServerInstance,
  ToolRegistry,
  WebhookRegistry,
} from '../src/types'

function createEchoRegistry() {
  const EchoInputSchema = z.object({
    value: z.string().optional().default('missing'),
  })

  const EchoOutputSchema = z.object({
    message: z.string(),
    envSnapshot: z.record(z.string(), z.string().optional()),
  })

  return {
    echo: {
      name: 'echo',
      description: 'Echo tool that returns the input value',
      inputSchema: EchoInputSchema,
      outputSchema: EchoOutputSchema,
      handler: async (input: { value?: string }, context: { env: Record<string, string | undefined>; mode?: 'execute' | 'estimate' }) => {
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
    },
  }
}

test('dedicated server exposes listen + health APIs', () => {
  const instance = server.create({
    computeLayer: 'dedicated',
    name: 'skedyul-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as DedicatedServerInstance

  assert.strictEqual(typeof instance.listen, 'function')
  assert.strictEqual(typeof instance.getHealthStatus, 'function')

  const snapshot = instance.getHealthStatus()
  assert.strictEqual(snapshot.status, 'running')
  assert.strictEqual(snapshot.runtime, 'dedicated')
  assert.ok(Array.isArray(snapshot.tools))
  assert.deepStrictEqual(snapshot.tools, ['echo'])
})

test('serverless handler responds to MCP calls and health checks', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'handler-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const { handler } = serverless

  const toolCall = {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call',
    params: {
      name: 'echo',
      arguments: {
        value: 'hi',
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
  assert.ok(parsedList.result.tools.some((tool: { name: string }) => tool.name === 'echo'))
})

test('serverless estimate endpoint returns billing data', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'handler-estimate-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

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
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'parse-error',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

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

test('Zod schema validation accepts valid inputs', async () => {
  const AddInputSchema = z.object({
    a: z.number(),
    b: z.number(),
  })

  const AddOutputSchema = z.object({
    result: z.number(),
  })

  const registry = {
    add: {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: AddInputSchema,
      outputSchema: AddOutputSchema,
      handler: async (input: { a: number; b: number }) => {
        return {
          output: {
            result: input.a + input.b,
          },
          billing: { credits: 1 },
        }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'zod-validation-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  const toolCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'add',
      arguments: {
        a: 5,
        b: 3,
      },
    },
  }

  const response = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify(toolCall),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'zod-valid' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.result)
  const output = JSON.parse(parsed.result.content[0].text)
  assert.strictEqual(output.result, 8)
})

test('Zod schema validation rejects invalid inputs', async () => {
  const AddInputSchema = z.object({
    a: z.number(),
    b: z.number(),
  })

  const registry = {
    add: {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: AddInputSchema,
      handler: async (input: { a: number; b: number }) => {
        return {
          output: { result: input.a + input.b },
          billing: { credits: 1 },
        }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'zod-invalid-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  const toolCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'add',
      arguments: {
        a: 'not-a-number',
        b: 3,
      },
    },
  }

  const response = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify(toolCall),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'zod-invalid' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.error || parsed.result?.isError)
})

test('Zod schema with required and optional fields', async () => {
  const UserInputSchema = z.object({
    name: z.string(),
    age: z.number().optional(),
    email: z.string().email().optional(),
  })

  const registry = {
    createUser: {
      name: 'createUser',
      description: 'Create a user',
      inputSchema: UserInputSchema,
      handler: async (input: { name: string; age?: number; email?: string }) => {
        return {
          output: {
            user: {
              name: input.name,
              age: input.age ?? null,
              email: input.email ?? null,
            },
          },
          billing: { credits: 1 },
        }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'zod-optional-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  // Test with only required field
  const toolCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'createUser',
      arguments: {
        name: 'John Doe',
      },
    },
  }

  const response = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify(toolCall),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'zod-optional' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.result)
  const output = JSON.parse(parsed.result.content[0].text)
  assert.strictEqual(output.user.name, 'John Doe')
  assert.strictEqual(output.user.age, null)
})

test('Zod schema with nested objects and arrays', async () => {
  const ComplexInputSchema = z.object({
    user: z.object({
      name: z.string(),
      tags: z.array(z.string()),
    }),
    metadata: z.record(z.string(), z.string()).optional(),
  })

  const registry = {
    complex: {
      name: 'complex',
      description: 'Complex tool with nested structures',
      inputSchema: ComplexInputSchema,
      handler: async (input: { user: { name: string; tags: string[] }; metadata?: Record<string, string> }) => {
        return {
          output: {
            processed: true,
            user: input.user,
            metadata: input.metadata ?? {},
          },
          billing: { credits: 1 },
        }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'zod-complex-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  const toolCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'complex',
      arguments: {
        user: {
          name: 'Alice',
          tags: ['admin', 'user'],
        },
        metadata: {
          source: 'test',
        },
      },
    },
  }

  const response = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify(toolCall),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'zod-complex' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.result)
  const output = JSON.parse(parsed.result.content[0].text)
  assert.strictEqual(output.processed, true)
  assert.strictEqual(output.user.name, 'Alice')
  assert.deepStrictEqual(output.user.tags, ['admin', 'user'])
})

test('Multiple tools in registry work correctly', async () => {
  const registry = {
    add: {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: z.object({
        a: z.number(),
        b: z.number(),
      }),
      handler: async (input: { a: number; b: number }) => ({
        output: { result: input.a + input.b },
        billing: { credits: 1 },
      }),
    },
    multiply: {
      name: 'multiply',
      description: 'Multiply two numbers',
      inputSchema: z.object({
        a: z.number(),
        b: z.number(),
      }),
      handler: async (input: { a: number; b: number }) => ({
        output: { result: input.a * input.b },
        billing: { credits: 1 },
      }),
    },
    "say-hello-to-the dev": {
      name: 'Say hello to the dev',
      description: 'communicates with the dev',
      inputSchema: z.object({
        devName: z.string(),
      }),
      handler: async (input: { devName: string }) => ({
        output: { result: `Hello, ${input.devName}!` },
        billing: { credits: 1 },
      }),
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'multi-tool-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  // Test add
  const addResponse = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'add',
        arguments: { a: 5, b: 3 },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'add' },
  })

  assert.strictEqual(addResponse.statusCode, 200)
  const addParsed = JSON.parse(addResponse.body)
  const addOutput = JSON.parse(addParsed.result.content[0].text)
  assert.strictEqual(addOutput.result, 8)

  // Test multiply
  const multiplyResponse = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'multiply',
        arguments: { a: 4, b: 7 },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'multiply' },
  })

  assert.strictEqual(multiplyResponse.statusCode, 200)
  const multiplyParsed = JSON.parse(multiplyResponse.body)
  const multiplyOutput = JSON.parse(multiplyParsed.result.content[0].text)
  assert.strictEqual(multiplyOutput.result, 28)

  // Test tools/list includes both
  const listResponse = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {},
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'list' },
  })

  console.log(listResponse.body)

  assert.strictEqual(listResponse.statusCode, 200)
  const listParsed = JSON.parse(listResponse.body)
  const toolNames = listParsed.result.tools.map((t: { name: string }) => t.name)
  assert.ok(toolNames.includes('add'))
  assert.ok(toolNames.includes('multiply'))
})

test('Tool with custom name different from registry key', async () => {
  const registry = {
    'custom-key': {
      name: 'custom-tool-name',
      description: 'Tool with custom name',
      inputSchema: z.object({
        value: z.string(),
      }),
      handler: async (input: { value: string }) => ({
        output: { echo: input.value },
        billing: { credits: 1 },
      }),
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'custom-name-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  // Use the custom name, not the registry key
  const response = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'custom-tool-name',
        arguments: { value: 'test' },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'custom-name' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.result)
  const output = JSON.parse(parsed.result.content[0].text)
  assert.strictEqual(output.echo, 'test')
})

test('Estimate endpoint works with Zod schema validation', async () => {
  const CalculateInputSchema = z.object({
    operation: z.enum(['add', 'multiply']),
    a: z.number(),
    b: z.number(),
  })

  const registry : ToolRegistry = {
    calculate: {
      name: 'calculate',
      description: 'Perform calculation',
      inputSchema: CalculateInputSchema,
      handler: async (input: { operation: 'add' | 'multiply'; a: number; b: number }, context: { mode?: 'execute' | 'estimate' }) => {
        const result =
          input.operation === 'add'
            ? input.a + input.b
            : input.a * input.b
        const credits = context.mode === 'estimate' ? 0 : 1

        return {
          output: { result },
          billing: { credits },
        }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'estimate-zod-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  const estimateResponse = await handler({
    path: '/estimate',
    httpMethod: 'POST',
    body: JSON.stringify({
      name: 'calculate',
      inputs: {
        operation: 'add',
        a: 10,
        b: 5,
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'estimate-zod' },
  })

  assert.strictEqual(estimateResponse.statusCode, 200)
  const parsed = JSON.parse(estimateResponse.body)
  assert.ok(parsed.billing)
  // In estimate mode, credits should be 0
  assert.strictEqual(parsed.billing.credits, 0)
})

test('server.create works with a namespaced registry object', async () => {
  const AppointmentInputSchema = z.object({
    petName: z.string(),
    ownerName: z.string(),
  })

  const AppointmentOutputSchema = z.object({
    summary: z.string(),
  })

  const registry: ToolRegistry = {
    'appointments.create': {
      name: 'appointments.create',
      description: 'Create an appointment (namespaced style)',
      inputSchema: AppointmentInputSchema,
      outputSchema: AppointmentOutputSchema,
      handler: async (
        input: { petName: string; ownerName: string },
        context: { mode?: 'execute' | 'estimate' },
      ) => {
        const summary = `${input.petName} with ${input.ownerName} (${context.mode ?? 'execute'})`
        return {
          output: { summary },
          billing: { credits: summary.length },
        }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'namespaced-registry-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  const { handler } = serverless

  const toolCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'appointments.create',
      arguments: {
        petName: 'Fido',
        ownerName: 'Alice',
      },
    },
  }

  const response = await handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify(toolCall),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'petbooqz-style' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.result)
  const output = JSON.parse(parsed.result.content[0].text)
  assert.strictEqual(
    output.summary,
    'Fido with Alice (execute)',
  )
  assert.strictEqual(parsed.result.billing.credits, output.summary.length)
})

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Handler Tests
// ─────────────────────────────────────────────────────────────────────────────

test('install handler is invoked with correct context', async () => {
  let capturedContext: unknown = null

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'install-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
    hooks: {
      install: async (ctx) => {
        capturedContext = ctx
        return { env: { CUSTOM_VAR: 'installed' } }
      },
    },
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/install',
    httpMethod: 'POST',
    body: JSON.stringify({
      env: { SKEDYUL_API_TOKEN: 'test-token' },
      context: {
        app: { id: 'app-1', versionId: 'v1', handle: 'test-app', versionHandle: 'v1' },
        appInstallationId: 'inst-123',
        workplace: { id: 'wkp-1', subdomain: 'test' },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'install' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.env.CUSTOM_VAR, 'installed')
  assert.ok(capturedContext)
  const ctx = capturedContext as { appInstallationId: string; workplace: { id: string } }
  assert.strictEqual(ctx.appInstallationId, 'inst-123')
  assert.strictEqual(ctx.workplace.id, 'wkp-1')
})

test('install endpoint returns 404 when handler not configured', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'no-install',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/install',
    httpMethod: 'POST',
    body: JSON.stringify({
      context: {
        app: { id: 'app-1', versionId: 'v1' },
        appInstallationId: 'inst-123',
        workplace: { id: 'wkp-1', subdomain: 'test' },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'no-install' },
  })

  assert.strictEqual(response.statusCode, 404)
})

test('uninstall handler is invoked and returns cleanedWebhookIds', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'uninstall-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
    hooks: {
      uninstall: async () => {
        return { cleanedWebhookIds: ['whk-1', 'whk-2'] }
      },
    },
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/uninstall',
    httpMethod: 'POST',
    body: JSON.stringify({
      env: {},
      context: {
        app: { id: 'app-1', versionId: 'v1', handle: 'test', versionHandle: 'v1' },
        appInstallationId: 'inst-123',
        workplace: { id: 'wkp-1', subdomain: 'test' },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'uninstall' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.deepStrictEqual(parsed.cleanedWebhookIds, ['whk-1', 'whk-2'])
})

test('uninstall endpoint returns 404 when handler not configured', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'no-uninstall',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/uninstall',
    httpMethod: 'POST',
    body: JSON.stringify({
      context: {
        app: { id: 'app-1', versionId: 'v1', handle: 'test', versionHandle: 'v1' },
        appInstallationId: 'inst-123',
        workplace: { id: 'wkp-1', subdomain: 'test' },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'no-uninstall' },
  })

  assert.strictEqual(response.statusCode, 404)
})

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handling Tests
// ─────────────────────────────────────────────────────────────────────────────

test('webhook routes to correct handler', async () => {
  let receivedBody: unknown = null

  const webhookRegistry: WebhookRegistry = {
    'receive-sms': {
      name: 'receive-sms',
      description: 'Receive SMS webhook',
      methods: ['POST'],
      handler: async (req) => {
        receivedBody = req.body
        return { status: 200, body: { received: true } }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'webhook-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
    webhooks: webhookRegistry,
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/webhooks/receive-sms',
    httpMethod: 'POST',
    body: JSON.stringify({
      env: {},
      request: {
        method: 'POST',
        url: 'https://example.com/webhooks/receive-sms',
        path: '/webhooks/receive-sms',
        headers: { 'content-type': 'application/json' },
        query: {},
        body: JSON.stringify({ from: '+1234567890', message: 'Hello' }),
      },
      context: {
        app: { id: 'app-1', versionId: 'v1' },
        appInstallationId: 'inst-123',
        workplace: { id: 'wkp-1', subdomain: 'test' },
        registration: null,
      },
    }),
    headers: { 'content-type': 'application/json' },
    queryStringParameters: null,
    requestContext: { requestId: 'webhook' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.received, true)
})

test('webhook returns 404 for unknown handler', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'webhook-404',
    version: '0.0.1',
    tools: createEchoRegistry(),
    webhooks: {},
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/webhooks/unknown-handler',
    httpMethod: 'POST',
    body: '{}',
    headers: { 'x-skedyul-app-id': 'app-1', 'x-skedyul-app-version-id': 'v1' },
    queryStringParameters: null,
    requestContext: { requestId: 'webhook-404' },
  })

  assert.strictEqual(response.statusCode, 404)
})

test('webhook returns 405 for disallowed method', async () => {
  const webhookRegistry: WebhookRegistry = {
    'post-only': {
      name: 'post-only',
      description: 'POST only webhook',
      methods: ['POST'],
      handler: async () => ({ status: 200, body: {} }),
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'webhook-405',
    version: '0.0.1',
    tools: createEchoRegistry(),
    webhooks: webhookRegistry,
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/webhooks/post-only',
    httpMethod: 'GET',
    body: null,
    headers: { 'x-skedyul-app-id': 'app-1', 'x-skedyul-app-version-id': 'v1' },
    queryStringParameters: null,
    requestContext: { requestId: 'webhook-405' },
  })

  assert.strictEqual(response.statusCode, 405)
})

// ─────────────────────────────────────────────────────────────────────────────
// Tool Handler Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

test('tool call returns error for unknown tool', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'unknown-tool',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'nonexistent-tool', arguments: {} },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'unknown-tool' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.error)
  assert.strictEqual(parsed.error.code, -32602)
  assert.ok(parsed.error.message.includes('not found'))
})

test('tool handler receives context with different trigger types', async () => {
  let capturedContext: unknown = null

  const registry = {
    'capture-context': {
      name: 'capture-context',
      description: 'Captures execution context',
      inputSchema: z.object({}),
      handler: async (_input: unknown, context: unknown) => {
        capturedContext = context
        return { output: { captured: true }, billing: { credits: 0 } }
      },
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'context-test',
    version: '0.0.1',
    tools: registry,
  }) as ServerlessServerInstance

  // Test with workflow trigger
  await serverless.handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'capture-context',
        arguments: {
          inputs: {},
          context: {
            trigger: 'workflow',
            app: { id: 'app-1', versionId: 'v1' },
            appInstallationId: 'inst-123',
            workplace: { id: 'wkp-1', subdomain: 'test' },
            request: { url: 'https://example.com', params: {}, query: {} },
          },
        },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'workflow-trigger' },
  })

  assert.ok(capturedContext)
  const ctx = capturedContext as { trigger: string }
  assert.strictEqual(ctx.trigger, 'workflow')
})

// ─────────────────────────────────────────────────────────────────────────────
// MCP Protocol Tests
// ─────────────────────────────────────────────────────────────────────────────

test('MCP returns error for invalid JSON-RPC version', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'jsonrpc-version',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 1,
      method: 'tools/list',
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'bad-version' },
  })

  assert.strictEqual(response.statusCode, 400)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, -32600)
})

test('MCP returns error for unknown method', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'unknown-method',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/method',
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'unknown-method' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, -32601)
})

test('MCP webhooks/list returns registered webhooks', async () => {
  const webhookRegistry: WebhookRegistry = {
    'webhook-a': {
      name: 'webhook-a',
      description: 'First webhook',
      methods: ['POST'],
      handler: async () => ({ status: 200, body: {} }),
    },
    'webhook-b': {
      name: 'webhook-b',
      description: 'Second webhook',
      methods: ['GET', 'POST'],
      type: 'CALLBACK',
      handler: async () => ({ status: 200, body: {} }),
    },
  }

  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'webhooks-list',
    version: '0.0.1',
    tools: createEchoRegistry(),
    webhooks: webhookRegistry,
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'webhooks/list',
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'webhooks-list' },
  })

  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.ok(parsed.result.webhooks)
  assert.strictEqual(parsed.result.webhooks.length, 2)
  const webhookA = parsed.result.webhooks.find((w: { name: string }) => w.name === 'webhook-a')
  assert.ok(webhookA)
  assert.deepStrictEqual(webhookA.methods, ['POST'])
})

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Endpoint Tests
// ─────────────────────────────────────────────────────────────────────────────

test('OPTIONS preflight returns 200', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'options-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/mcp',
    httpMethod: 'OPTIONS',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'options' },
  })

  assert.strictEqual(response.statusCode, 200)
})

test('unknown path returns 404', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: '404-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/unknown/path',
    httpMethod: 'GET',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: '404' },
  })

  assert.strictEqual(response.statusCode, 404)
})

test('health endpoint returns correct structure', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'health-structure',
    version: '0.0.1',
    maxRequests: 100,
    ttlExtendSeconds: 1800,
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/health',
    httpMethod: 'GET',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'health' },
  })

  assert.strictEqual(response.statusCode, 200)
  const health = JSON.parse(response.body)
  assert.strictEqual(health.status, 'running')
  assert.strictEqual(health.maxRequests, 100)
  assert.strictEqual(health.ttlExtendSeconds, 1800)
  assert.strictEqual(health.runtime, 'serverless')
  assert.ok(Array.isArray(health.tools))
  assert.ok(typeof health.requests === 'number')
  assert.ok(typeof health.lastRequestTime === 'number')
})

// ─────────────────────────────────────────────────────────────────────────────
// Request State Management Tests
// ─────────────────────────────────────────────────────────────────────────────

test('request count increments on tool calls', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'request-count',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  // Initial health check
  let healthResponse = await serverless.handler({
    path: '/health',
    httpMethod: 'GET',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'health-1' },
  })
  let health = JSON.parse(healthResponse.body)
  assert.strictEqual(health.requests, 0)

  // Make a tool call
  await serverless.handler({
    path: '/mcp',
    httpMethod: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'echo', arguments: { value: 'test' } },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'tool-call' },
  })

  // Check count increased
  healthResponse = await serverless.handler({
    path: '/health',
    httpMethod: 'GET',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'health-2' },
  })
  health = JSON.parse(healthResponse.body)
  assert.strictEqual(health.requests, 1)
})

test('estimate mode does not increment request count', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'estimate-no-count',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  // Make an estimate call
  await serverless.handler({
    path: '/estimate',
    httpMethod: 'POST',
    body: JSON.stringify({ name: 'echo', inputs: { value: 'test' } }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'estimate' },
  })

  // Check count is still 0
  const healthResponse = await serverless.handler({
    path: '/health',
    httpMethod: 'GET',
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'health' },
  })
  const health = JSON.parse(healthResponse.body)
  assert.strictEqual(health.requests, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// Core API Handler Tests
// ─────────────────────────────────────────────────────────────────────────────

test('core endpoint returns 400 for missing method', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'core-no-method',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/core',
    httpMethod: 'POST',
    body: JSON.stringify({ params: {} }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'core-no-method' },
  })

  assert.strictEqual(response.statusCode, 400)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, -32602)
})

test('core endpoint returns parse error for invalid JSON', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'core-parse-error',
    version: '0.0.1',
    tools: createEchoRegistry(),
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/core',
    httpMethod: 'POST',
    body: '{ invalid json',
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'core-parse' },
  })

  assert.strictEqual(response.statusCode, 400)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, -32700)
})

// ─────────────────────────────────────────────────────────────────────────────
// Error Classes Tests
// ─────────────────────────────────────────────────────────────────────────────

import {
  InstallError,
  MissingRequiredFieldError,
  AuthenticationError,
  InvalidConfigurationError,
  ConnectionError,
  AppAuthInvalidError,
} from '../src/errors'

test('InstallError has correct properties', () => {
  const error = new InstallError('Custom message', 'INVALID_CONFIGURATION', 'fieldName')
  assert.strictEqual(error.code, 'INVALID_CONFIGURATION')
  assert.strictEqual(error.message, 'Custom message')
  assert.strictEqual(error.field, 'fieldName')
  assert.ok(error instanceof Error)
})

test('MissingRequiredFieldError has correct defaults', () => {
  const error = new MissingRequiredFieldError('email')
  assert.strictEqual(error.code, 'MISSING_REQUIRED_FIELD')
  assert.strictEqual(error.field, 'email')
  assert.ok(error.message.includes('email'))
})

test('MissingRequiredFieldError accepts custom message', () => {
  const error = new MissingRequiredFieldError('email', 'Email is required for signup')
  assert.strictEqual(error.message, 'Email is required for signup')
})

test('AuthenticationError has correct defaults', () => {
  const error = new AuthenticationError()
  assert.strictEqual(error.code, 'AUTHENTICATION_FAILED')
  assert.ok(error.message.includes('Authentication'))
})

test('AuthenticationError accepts custom message', () => {
  const error = new AuthenticationError('Invalid API key')
  assert.strictEqual(error.message, 'Invalid API key')
})

test('InvalidConfigurationError has correct defaults', () => {
  const error = new InvalidConfigurationError()
  assert.strictEqual(error.code, 'INVALID_CONFIGURATION')
})

test('InvalidConfigurationError accepts field parameter', () => {
  const error = new InvalidConfigurationError('apiKey', 'API key format is invalid')
  assert.strictEqual(error.field, 'apiKey')
  assert.strictEqual(error.message, 'API key format is invalid')
})

test('ConnectionError has correct defaults', () => {
  const error = new ConnectionError()
  assert.strictEqual(error.code, 'CONNECTION_FAILED')
})

test('AppAuthInvalidError has correct code', () => {
  const error = new AppAuthInvalidError('Token expired')
  assert.strictEqual(error.code, 'APP_AUTH_INVALID')
  assert.strictEqual(error.message, 'Token expired')
})

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions Tests
// ─────────────────────────────────────────────────────────────────────────────

import {
  normalizeBilling,
  parseJsonRecord,
  parseNumberEnv,
  mergeRuntimeEnv,
  createResponse,
} from '../src/server/index'

test('normalizeBilling returns default credits when undefined', () => {
  const result = normalizeBilling(undefined)
  assert.strictEqual(result.credits, 0)
})

test('normalizeBilling preserves existing billing', () => {
  const result = normalizeBilling({ credits: 10 })
  assert.strictEqual(result.credits, 10)
})

test('parseJsonRecord parses valid JSON string', () => {
  const result = parseJsonRecord('{"key": "value"}')
  assert.deepStrictEqual(result, { key: 'value' })
})

test('parseJsonRecord returns empty object for invalid JSON', () => {
  const result = parseJsonRecord('invalid json')
  assert.deepStrictEqual(result, {})
})

test('parseJsonRecord returns empty object for undefined', () => {
  const result = parseJsonRecord(undefined)
  assert.deepStrictEqual(result, {})
})

test('parseNumberEnv parses valid number string', () => {
  const result = parseNumberEnv('42')
  assert.strictEqual(result, 42)
})

test('parseNumberEnv returns null for invalid number', () => {
  const result = parseNumberEnv('not-a-number')
  assert.strictEqual(result, null)
})

test('parseNumberEnv returns null for undefined', () => {
  const result = parseNumberEnv(undefined)
  assert.strictEqual(result, null)
})

test('createResponse returns correct API Gateway format', () => {
  const response = createResponse(200, { message: 'OK' }, { 'Content-Type': 'application/json', 'X-Custom': 'header' })
  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.headers?.['X-Custom'], 'header')
  assert.strictEqual(response.headers?.['Content-Type'], 'application/json')
  const body = JSON.parse(response.body)
  assert.strictEqual(body.message, 'OK')
})

test('mergeRuntimeEnv merges MCP_ENV into process.env', () => {
  const originalEnv = { ...process.env }
  process.env.MCP_ENV = JSON.stringify({ TEST_VAR: 'test_value' })
  
  mergeRuntimeEnv()
  
  assert.strictEqual(process.env.TEST_VAR, 'test_value')
  
  // Cleanup
  delete process.env.TEST_VAR
  delete process.env.MCP_ENV
  Object.assign(process.env, originalEnv)
})

// ─────────────────────────────────────────────────────────────────────────────
// Install Handler Error Handling Tests
// ─────────────────────────────────────────────────────────────────────────────

test('install handler returns InstallError details', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'install-error-test',
    version: '0.0.1',
    tools: createEchoRegistry(),
    hooks: {
      install: async () => {
        throw new MissingRequiredFieldError('apiKey')
      },
    },
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/install',
    httpMethod: 'POST',
    body: JSON.stringify({
      env: {},
      context: {
        app: { id: 'app-1', versionId: 'v1', handle: 'test', versionHandle: 'v1' },
        appInstallationId: 'inst-123',
        workplace: { id: 'wkp-1', subdomain: 'test' },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'install-error' },
  })

  assert.strictEqual(response.statusCode, 400)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, 'MISSING_REQUIRED_FIELD')
  assert.strictEqual(parsed.error.field, 'apiKey')
})

test('install handler returns 500 for generic errors', async () => {
  const serverless = server.create({
    computeLayer: 'serverless',
    name: 'install-generic-error',
    version: '0.0.1',
    tools: createEchoRegistry(),
    hooks: {
      install: async () => {
        throw new Error('Something went wrong')
      },
    },
  }) as ServerlessServerInstance

  const response = await serverless.handler({
    path: '/install',
    httpMethod: 'POST',
    body: JSON.stringify({
      env: {},
      context: {
        app: { id: 'app-1', versionId: 'v1', handle: 'test', versionHandle: 'v1' },
        appInstallationId: 'inst-123',
        workplace: { id: 'wkp-1', subdomain: 'test' },
      },
    }),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'install-generic' },
  })

  assert.strictEqual(response.statusCode, 500)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, -32603)
  assert.ok(parsed.error.message.includes('Something went wrong'))
})

