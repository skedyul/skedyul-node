import { test } from 'node:test'
import assert from 'node:assert/strict'
import { server, TokenRefreshRequiredError } from '../src/index'
import type { ServerlessServerInstance, WebhookRegistry } from '../src/types'
import { AppAuthInvalidError } from '../src/errors'

const registration = {
  id: 'whreg_1',
  name: 'calendar_push',
  url: 'https://example.test/api/webhooks/whreg_1',
  context: { calendar_id: 'cal_1' },
  expiresAt: '2026-11-30T00:00:00.000Z',
}

const context = {
  app: { id: 'app-1', versionId: 'v1', handle: 'google', versionHandle: 'v1' },
  appInstallationId: 'inst-1',
  workplace: { id: 'wkp-1', subdomain: 'test' },
}

const create = (webhooks: WebhookRegistry) =>
  server.create({
    computeLayer: 'serverless',
    name: 'renew-test',
    version: '0.0.1',
    tools: {},
    webhooks,
  }) as ServerlessServerInstance

const call = (instance: ServerlessServerInstance, body: unknown) =>
  instance.handler({
    path: '/webhook_renew',
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: 'renew' },
  })

const handler = async () => ({ status: 200 })

test('webhook_renew calls the webhook renew handler and returns the new expiry', async () => {
  let seen: unknown = null
  const instance = create({
    calendar_push: {
      name: 'calendar_push',
      description: 'push',
      handler,
      renew: async (ctx) => {
        seen = {
          registration: ctx.registration,
          appInstallationId: ctx.appInstallationId,
          token: ctx.env.SKEDYUL_API_TOKEN,
        }
        return { expiresAt: '2026-12-07T00:00:00.000Z', context: { calendar_id: 'cal_1', n: 2 } }
      },
    },
  })

  const response = await call(instance, {
    env: { SKEDYUL_API_TOKEN: 'sk_wkp_test' },
    registration,
    context,
  })

  assert.strictEqual(response.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(response.body), {
    expiresAt: '2026-12-07T00:00:00.000Z',
    context: { calendar_id: 'cal_1', n: 2 },
  })
  assert.deepStrictEqual(seen, {
    registration,
    appInstallationId: 'inst-1',
    token: 'sk_wkp_test',
  })
})

test('webhook_renew passes { delete: true } through', async () => {
  const instance = create({
    calendar_push: {
      name: 'calendar_push',
      description: 'push',
      handler,
      renew: async () => ({ delete: true }),
    },
  })
  const response = await call(instance, { env: {}, registration, context })
  assert.strictEqual(response.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(response.body), { delete: true })
})

test('webhook_renew returns 404 when the webhook has no renew handler', async () => {
  const instance = create({
    calendar_push: { name: 'calendar_push', description: 'push', handler },
  })
  const response = await call(instance, { env: {}, registration, context })
  assert.strictEqual(response.statusCode, 404)
})

test('webhook_renew rejects a body without a registration', async () => {
  const instance = create({})
  const response = await call(instance, { env: {} })
  assert.strictEqual(response.statusCode, 400)
})

test('webhook_renew reports TOKEN_REFRESH_REQUIRED so the platform can refresh and retry', async () => {
  const instance = create({
    calendar_push: {
      name: 'calendar_push',
      description: 'push',
      handler,
      renew: async () => {
        throw new TokenRefreshRequiredError('expired', { tokenKey: 'GOOGLE_ACCESS_TOKEN' })
      },
    },
  })
  const response = await call(instance, { env: {}, registration, context })
  assert.strictEqual(response.statusCode, 200)
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, 'TOKEN_REFRESH_REQUIRED')
  assert.strictEqual(parsed.error.details.tokenKey, 'GOOGLE_ACCESS_TOKEN')
})

test('webhook_renew reports APP_AUTH_INVALID', async () => {
  const instance = create({
    calendar_push: {
      name: 'calendar_push',
      description: 'push',
      handler,
      renew: async () => {
        throw new AppAuthInvalidError('invalid_grant')
      },
    },
  })
  const response = await call(instance, { env: {}, registration, context })
  const parsed = JSON.parse(response.body)
  assert.strictEqual(parsed.error.code, 'APP_AUTH_INVALID')
})

test('webhook_renew returns 500 for any other failure', async () => {
  const instance = create({
    calendar_push: {
      name: 'calendar_push',
      description: 'push',
      handler,
      renew: async () => {
        throw new Error('provider down')
      },
    },
  })
  const response = await call(instance, { env: {}, registration, context })
  assert.strictEqual(response.statusCode, 500)
  assert.strictEqual(JSON.parse(response.body).error.message, 'provider down')
})
