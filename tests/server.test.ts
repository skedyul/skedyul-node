import { test } from 'node:test'
import assert from 'node:assert/strict'
import { server } from '../dist/index.js'
import { z } from 'zod'
import type {
  DedicatedServerInstance,
  ServerlessServerInstance,
  ToolRegistry,
} from '../dist/types'

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
      handler: async ({ input, context }: { input: { value?: string }; context: { env: Record<string, string | undefined>; mode?: 'execute' | 'estimate' } }) => {
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
  const instance = server.create(
    {
      computeLayer: 'dedicated',
      metadata: {
        name: 'skedyul-test',
        version: '0.0.1',
      },
    },
    createEchoRegistry(),
  ) as DedicatedServerInstance

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
  ) as ServerlessServerInstance

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
  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'handler-estimate-test',
        version: '0.0.1',
      },
    },
    createEchoRegistry(),
  ) as ServerlessServerInstance

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
  ) as ServerlessServerInstance

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
      handler: async ({ input }: { input: { a: number; b: number } }) => {
        return {
          output: {
            result: input.a + input.b,
          },
          billing: { credits: 1 },
        }
      },
    },
  }

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'zod-validation-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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
      handler: async ({ input }: { input: { a: number; b: number } }) => {
        return {
          output: { result: input.a + input.b },
          billing: { credits: 1 },
        }
      },
    },
  }

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'zod-invalid-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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
      handler: async ({ input }: { input: { name: string; age?: number; email?: string } }) => {
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

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'zod-optional-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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
      handler: async ({ input }: { input: { user: { name: string; tags: string[] }; metadata?: Record<string, string> } }) => {
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

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'zod-complex-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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
      handler: async ({ input }: { input: { a: number; b: number } }) => ({
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
      handler: async ({ input }: { input: { a: number; b: number } }) => ({
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
      handler: async ({ input }: { input: { devName: string } }) => ({
        output: { result: `Hello, ${input.devName}!` },
        billing: { credits: 1 },
      }),
    },
  }

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'multi-tool-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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
      handler: async ({ input }: { input: { value: string } }) => ({
        output: { echo: input.value },
        billing: { credits: 1 },
      }),
    },
  }

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'custom-name-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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
      handler: async ({ input, context }: { input: { operation: 'add' | 'multiply'; a: number; b: number }; context: { mode?: 'execute' | 'estimate' } }) => {
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

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'estimate-zod-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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
      handler: async ({
        input,
        context,
      }: {
        input: { petName: string; ownerName: string }
        context: { mode?: 'execute' | 'estimate' }
      }) => {
        const summary = `${input.petName} with ${input.ownerName} (${context.mode ?? 'execute'})`
        return {
          output: { summary },
          billing: { credits: summary.length },
        }
      },
    },
  }

  const serverless = server.create(
    {
      computeLayer: 'serverless',
      metadata: {
        name: 'namespaced-registry-test',
        version: '0.0.1',
      },
    },
    registry,
  ) as ServerlessServerInstance

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


