import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWithConfig, runWithAlsConfig, getConfig } from '../src/core/client.js'

test('runWithConfig mirrors apiToken into process.env for async handlers', async () => {
  const originalToken = process.env.SKEDYUL_API_TOKEN
  const originalUrl = process.env.SKEDYUL_API_URL

  process.env.SKEDYUL_API_TOKEN = 'sk_prv_outer'
  process.env.SKEDYUL_API_URL = 'https://outer.example'

  await runWithConfig(
    { baseUrl: 'https://inner.example', apiToken: 'sk_wkp_inner' },
    async () => {
      await Promise.resolve()
      assert.strictEqual(process.env.SKEDYUL_API_TOKEN, 'sk_wkp_inner')
      assert.strictEqual(process.env.SKEDYUL_API_URL, 'https://inner.example')
    },
  )

  assert.strictEqual(process.env.SKEDYUL_API_TOKEN, 'sk_prv_outer')
  assert.strictEqual(process.env.SKEDYUL_API_URL, 'https://outer.example')

  if (originalToken === undefined) delete process.env.SKEDYUL_API_TOKEN
  else process.env.SKEDYUL_API_TOKEN = originalToken

  if (originalUrl === undefined) delete process.env.SKEDYUL_API_URL
  else process.env.SKEDYUL_API_URL = originalUrl
})

test('getConfig prefers process.env over stale AsyncLocalStorage on warm Lambda', () => {
  const originalToken = process.env.SKEDYUL_API_TOKEN
  const originalUrl = process.env.SKEDYUL_API_URL

  // OAuth callback envelope (withRequestEnv)
  process.env.SKEDYUL_API_TOKEN = 'sk_prv_oauth'
  process.env.SKEDYUL_API_URL = 'https://admin.example'

  // Stale ALS from a prior install hook on the same warm Lambda
  runWithAlsConfig(
    { baseUrl: 'https://install.example', apiToken: 'sk_wkp_install' },
    () => {
      const config = getConfig()
      assert.strictEqual(config.apiToken, 'sk_prv_oauth')
      assert.strictEqual(config.baseUrl, 'https://admin.example')
    },
  )

  if (originalToken === undefined) delete process.env.SKEDYUL_API_TOKEN
  else process.env.SKEDYUL_API_TOKEN = originalToken

  if (originalUrl === undefined) delete process.env.SKEDYUL_API_URL
  else process.env.SKEDYUL_API_URL = originalUrl
})
