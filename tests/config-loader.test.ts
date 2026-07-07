import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { loadConfig } from '../src/config/loader'

test('loadConfig transpiles static default imports without swallowing following newlines', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skedyul-config-loader-'))

  const packageJsonPath = path.join(tempDir, 'package.json')
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify({ version: '1.2.3' }, null, 2),
    'utf-8',
  )

  const registriesPath = path.join(tempDir, 'registries.cjs')
  fs.writeFileSync(
    registriesPath,
    'module.exports = { toolRegistry: {} }\n',
    'utf-8',
  )

  const provisionPath = path.join(tempDir, 'provision.cjs')
  fs.writeFileSync(provisionPath, 'module.exports = { models: [] }\n', 'utf-8')

  const configPath = path.join(tempDir, 'skedyul.config.ts')
  fs.writeFileSync(
    configPath,
    `import { defineConfig } from 'skedyul'
import pkg from './package.json' with { type: 'json' }
import { toolRegistry } from './registries.cjs'
import provisionConfig from './provision.cjs'

export default defineConfig({
  name: 'TestApp',
  version: pkg.version,
  computeLayer: 'serverless',
  tools: Promise.resolve({ toolRegistry }),
  provision: Promise.resolve({ default: provisionConfig }),
})
`,
    'utf-8',
  )

  try {
    const config = await loadConfig(configPath)
    assert.strictEqual(config.name, 'TestApp')
    assert.strictEqual(config.version, '1.2.3')
    assert.strictEqual(config.computeLayer, 'serverless')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
