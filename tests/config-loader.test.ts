import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { loadConfig } from '../src/config/loader'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skedyul-config-loader-'))
}

test('loadConfig transpiles static default imports without swallowing following newlines', async () => {
  const tempDir = createTempDir()

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

test('loadConfig loads Petbooqz-like static imports and inline queues', async () => {
  const tempDir = createTempDir()

  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ version: '2.1.38' }, null, 2),
    'utf-8',
  )

  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(tempDir, 'src/registries.ts'), 'export const toolRegistry = {}\n')
  fs.writeFileSync(path.join(tempDir, 'src/provision.ts'), 'export default { models: [] }\n')

  const configPath = path.join(tempDir, 'skedyul.config.ts')
  fs.writeFileSync(
    configPath,
    `import { defineConfig } from 'skedyul'
import pkg from './package.json' with { type: 'json' }
import { toolRegistry } from './src/registries'
import provisionConfig from './src/provision'

export default defineConfig({
  name: 'Petbooqz',
  version: pkg.version,
  computeLayer: 'serverless',
  tools: Promise.resolve({ toolRegistry }),
  provision: Promise.resolve({ default: provisionConfig }),
  queues: {
    petbooqz_api: {
      scope: 'install',
      maxConcurrent: 4,
      minTime: 100,
    },
  },
})
`,
    'utf-8',
  )

  try {
    const config = await loadConfig(configPath)
    assert.strictEqual(config.name, 'Petbooqz')
    assert.strictEqual(config.version, '2.1.38')
    assert.strictEqual(config.computeLayer, 'serverless')
    assert.deepStrictEqual(config.queues?.petbooqz_api, {
      scope: 'install',
      maxConcurrent: 4,
      minTime: 100,
    })
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('loadConfig loads BFT-like JSON catalogs and stubs dynamic imports', async () => {
  const tempDir = createTempDir()

  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ version: '0.0.1' }, null, 2),
    'utf-8',
  )

  fs.mkdirSync(path.join(tempDir, 'src/events'), { recursive: true })
  fs.writeFileSync(
    path.join(tempDir, 'src/events/catalog.json'),
    JSON.stringify([{ name: 'lead.created', description: 'Lead created' }], null, 2),
    'utf-8',
  )
  fs.writeFileSync(
    path.join(tempDir, 'src/events/catalog-examples.json'),
    JSON.stringify({ 'lead.created': { id: '123' } }, null, 2),
    'utf-8',
  )
  fs.writeFileSync(
    path.join(tempDir, 'src/events/catalog-context-fields.json'),
    JSON.stringify({ 'lead.created': [{ name: 'studioId' }] }, null, 2),
    'utf-8',
  )

  const configPath = path.join(tempDir, 'skedyul.config.ts')
  fs.writeFileSync(
    configPath,
    `import { defineConfig } from 'skedyul'
import pkg from './package.json' with { type: 'json' }
import catalogMeta from './src/events/catalog.json' with { type: 'json' }
import catalogExamples from './src/events/catalog-examples.json' with { type: 'json' }
import catalogContextFields from './src/events/catalog-context-fields.json' with { type: 'json' }

const events = catalogMeta.map((entry) => {
  const examplePayload = catalogExamples[entry.name]
  const contextFields = catalogContextFields[entry.name]

  return {
    ...entry,
    workflowInputType: \`@app/bft/\${entry.name.replace(/\\./g, '/')}\`,
    ...(examplePayload ? { examplePayload } : {}),
    ...(contextFields ? { contextFields } : {}),
  }
})

export default defineConfig({
  handle: 'bft',
  name: 'BFT Glofox Integration',
  version: pkg.version,
  computeLayer: 'serverless',
  tools: import('./src/registries'),
  webhooks: import('./src/registries'),
  provision: import('./src/provision'),
  events,
})
`,
    'utf-8',
  )

  try {
    const config = await loadConfig(configPath)
    assert.strictEqual(config.name, 'BFT Glofox Integration')
    assert.strictEqual((config as { handle?: string }).handle, 'bft')
    assert.strictEqual(config.computeLayer, 'serverless')
    assert.strictEqual(config.events?.length, 1)
    assert.strictEqual(config.events?.[0]?.name, 'lead.created')
    assert.deepStrictEqual(config.events?.[0]?.examplePayload, { id: '123' })
    assert.deepStrictEqual(config.events?.[0]?.contextFields, [{ name: 'studioId' }])
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
