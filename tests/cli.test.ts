import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Import CLI utilities
import {
  parseArgs,
  parseEnvFlags,
  loadEnvFile,
  formatJson,
} from '../src/cli/utils'

import {
  findConfigFile,
  findRegistryPath,
} from '../src/cli/utils/config'

// ─────────────────────────────────────────────────────────────────────────────
// parseArgs Tests
// ─────────────────────────────────────────────────────────────────────────────

test('parseArgs handles empty args', () => {
  const result = parseArgs([])
  assert.deepStrictEqual(result.flags, {})
  assert.deepStrictEqual(result.positional, [])
})

test('parseArgs parses positional arguments', () => {
  const result = parseArgs(['invoke', 'my-tool'])
  assert.deepStrictEqual(result.positional, ['invoke', 'my-tool'])
  assert.deepStrictEqual(result.flags, {})
})

test('parseArgs parses long flags with values', () => {
  const result = parseArgs(['--registry', './dist/registry.js', '--port', '3000'])
  assert.strictEqual(result.flags.registry, './dist/registry.js')
  assert.strictEqual(result.flags.port, '3000')
})

test('parseArgs parses long flags with equals syntax', () => {
  const result = parseArgs(['--registry=./dist/registry.js', '--port=3000'])
  assert.strictEqual(result.flags.registry, './dist/registry.js')
  assert.strictEqual(result.flags.port, '3000')
})

test('parseArgs parses boolean flags', () => {
  const result = parseArgs(['--verbose', '--debug'])
  assert.strictEqual(result.flags.verbose, true)
  assert.strictEqual(result.flags.debug, true)
})

test('parseArgs parses short flags with values', () => {
  const result = parseArgs(['-r', './registry.js', '-p', '3000'])
  assert.strictEqual(result.flags.r, './registry.js')
  assert.strictEqual(result.flags.p, '3000')
})

test('parseArgs parses short boolean flags', () => {
  const result = parseArgs(['-v', '-h'])
  assert.strictEqual(result.flags.v, true)
  assert.strictEqual(result.flags.h, true)
})

test('parseArgs handles mixed positional and flags', () => {
  const result = parseArgs(['invoke', 'my-tool', '--verbose', '--env', 'API_KEY=secret'])
  assert.deepStrictEqual(result.positional, ['invoke', 'my-tool'])
  assert.strictEqual(result.flags.verbose, true)
  assert.strictEqual(result.flags.env, 'API_KEY=secret')
})

test('parseArgs handles equals sign in value', () => {
  const result = parseArgs(['--env=API_KEY=secret=with=equals'])
  assert.strictEqual(result.flags.env, 'API_KEY=secret=with=equals')
})

test('parseArgs treats flag after flag as boolean', () => {
  const result = parseArgs(['--verbose', '--debug', '--port', '3000'])
  assert.strictEqual(result.flags.verbose, true)
  assert.strictEqual(result.flags.debug, true)
  assert.strictEqual(result.flags.port, '3000')
})

// ─────────────────────────────────────────────────────────────────────────────
// parseEnvFlags Tests
// ─────────────────────────────────────────────────────────────────────────────

test('parseEnvFlags parses --env flags', () => {
  const result = parseEnvFlags(['--env', 'API_KEY=secret', '--env', 'DB_URL=postgres://localhost'])
  assert.strictEqual(result.API_KEY, 'secret')
  assert.strictEqual(result.DB_URL, 'postgres://localhost')
})

test('parseEnvFlags parses -e short flags', () => {
  const result = parseEnvFlags(['-e', 'API_KEY=secret', '-e', 'DEBUG=true'])
  assert.strictEqual(result.API_KEY, 'secret')
  assert.strictEqual(result.DEBUG, 'true')
})

test('parseEnvFlags parses --env= syntax', () => {
  const result = parseEnvFlags(['--env=API_KEY=secret', '--env=DB_URL=postgres://localhost'])
  assert.strictEqual(result.API_KEY, 'secret')
  assert.strictEqual(result.DB_URL, 'postgres://localhost')
})

test('parseEnvFlags handles values with equals signs', () => {
  const result = parseEnvFlags(['--env', 'CONNECTION_STRING=host=localhost;port=5432'])
  assert.strictEqual(result.CONNECTION_STRING, 'host=localhost;port=5432')
})

test('parseEnvFlags returns empty object for no env flags', () => {
  const result = parseEnvFlags(['--verbose', '--port', '3000'])
  assert.deepStrictEqual(result, {})
})

test('parseEnvFlags ignores malformed env values', () => {
  const result = parseEnvFlags(['--env', 'INVALID_NO_EQUALS', '--env', 'VALID=value'])
  assert.strictEqual(result.VALID, 'value')
  assert.strictEqual(result.INVALID_NO_EQUALS, undefined)
})

// ─────────────────────────────────────────────────────────────────────────────
// loadEnvFile Tests
// ─────────────────────────────────────────────────────────────────────────────

test('loadEnvFile loads simple env file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const envPath = path.join(tmpDir, '.env')
  
  fs.writeFileSync(envPath, `
API_KEY=secret123
DB_URL=postgres://localhost:5432/db
DEBUG=true
`)
  
  const result = loadEnvFile(envPath)
  
  assert.strictEqual(result.API_KEY, 'secret123')
  assert.strictEqual(result.DB_URL, 'postgres://localhost:5432/db')
  assert.strictEqual(result.DEBUG, 'true')
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('loadEnvFile handles quoted values', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const envPath = path.join(tmpDir, '.env')
  
  fs.writeFileSync(envPath, `
DOUBLE_QUOTED="value with spaces"
SINGLE_QUOTED='another value'
UNQUOTED=no_spaces
`)
  
  const result = loadEnvFile(envPath)
  
  assert.strictEqual(result.DOUBLE_QUOTED, 'value with spaces')
  assert.strictEqual(result.SINGLE_QUOTED, 'another value')
  assert.strictEqual(result.UNQUOTED, 'no_spaces')
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('loadEnvFile skips comments and empty lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const envPath = path.join(tmpDir, '.env')
  
  fs.writeFileSync(envPath, `
# This is a comment
API_KEY=secret

# Another comment
DB_URL=postgres://localhost

`)
  
  const result = loadEnvFile(envPath)
  
  assert.strictEqual(Object.keys(result).length, 2)
  assert.strictEqual(result.API_KEY, 'secret')
  assert.strictEqual(result.DB_URL, 'postgres://localhost')
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('loadEnvFile throws for missing file', () => {
  assert.throws(
    () => loadEnvFile('/nonexistent/path/.env'),
    /Environment file not found/
  )
})

test('loadEnvFile handles values with equals signs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const envPath = path.join(tmpDir, '.env')
  
  fs.writeFileSync(envPath, `
CONNECTION=host=localhost;port=5432;user=admin
`)
  
  const result = loadEnvFile(envPath)
  
  assert.strictEqual(result.CONNECTION, 'host=localhost;port=5432;user=admin')
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatJson Tests
// ─────────────────────────────────────────────────────────────────────────────

test('formatJson formats with pretty print by default', () => {
  const data = { name: 'test', value: 123 }
  const result = formatJson(data)
  
  assert.ok(result.includes('\n'))
  assert.ok(result.includes('  '))
  assert.strictEqual(JSON.parse(result).name, 'test')
})

test('formatJson formats compact when pretty is false', () => {
  const data = { name: 'test', value: 123 }
  const result = formatJson(data, false)
  
  assert.ok(!result.includes('\n'))
  assert.strictEqual(result, '{"name":"test","value":123}')
})

test('formatJson handles nested objects', () => {
  const data = { 
    outer: { 
      inner: { 
        value: 'deep' 
      } 
    } 
  }
  const result = formatJson(data)
  
  const parsed = JSON.parse(result)
  assert.strictEqual(parsed.outer.inner.value, 'deep')
})

test('formatJson handles arrays', () => {
  const data = { items: [1, 2, 3] }
  const result = formatJson(data)
  
  const parsed = JSON.parse(result)
  assert.deepStrictEqual(parsed.items, [1, 2, 3])
})

// ─────────────────────────────────────────────────────────────────────────────
// findConfigFile Tests
// ─────────────────────────────────────────────────────────────────────────────

test('findConfigFile returns null for directory without config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  
  const result = findConfigFile(tmpDir)
  
  assert.strictEqual(result, null)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('findConfigFile finds skedyul.config.ts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const configPath = path.join(tmpDir, 'skedyul.config.ts')
  
  fs.writeFileSync(configPath, 'export default {}')
  
  const result = findConfigFile(tmpDir)
  
  assert.strictEqual(result, configPath)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('findConfigFile finds skedyul.config.js', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const configPath = path.join(tmpDir, 'skedyul.config.js')
  
  fs.writeFileSync(configPath, 'module.exports = {}')
  
  const result = findConfigFile(tmpDir)
  
  assert.strictEqual(result, configPath)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('findConfigFile prefers .ts over .js', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const tsPath = path.join(tmpDir, 'skedyul.config.ts')
  const jsPath = path.join(tmpDir, 'skedyul.config.js')
  
  fs.writeFileSync(tsPath, 'export default {}')
  fs.writeFileSync(jsPath, 'module.exports = {}')
  
  const result = findConfigFile(tmpDir)
  
  assert.strictEqual(result, tsPath)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// findRegistryPath Tests
// ─────────────────────────────────────────────────────────────────────────────

test('findRegistryPath returns null for directory without registry', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  
  const result = findRegistryPath(tmpDir)
  
  assert.strictEqual(result, null)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('findRegistryPath finds src/registry.ts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const srcDir = path.join(tmpDir, 'src')
  fs.mkdirSync(srcDir)
  const registryPath = path.join(srcDir, 'registry.ts')
  
  fs.writeFileSync(registryPath, 'export const registry = {}')
  
  const result = findRegistryPath(tmpDir)
  
  assert.strictEqual(result, registryPath)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('findRegistryPath finds dist/registry.js', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  const distDir = path.join(tmpDir, 'dist')
  fs.mkdirSync(distDir)
  const registryPath = path.join(distDir, 'registry.js')
  
  fs.writeFileSync(registryPath, 'module.exports = { registry: {} }')
  
  const result = findRegistryPath(tmpDir)
  
  assert.strictEqual(result, registryPath)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('findRegistryPath prefers src over dist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  
  const srcDir = path.join(tmpDir, 'src')
  fs.mkdirSync(srcDir)
  const srcPath = path.join(srcDir, 'registry.ts')
  fs.writeFileSync(srcPath, 'export const registry = {}')
  
  const distDir = path.join(tmpDir, 'dist')
  fs.mkdirSync(distDir)
  const distPath = path.join(distDir, 'registry.js')
  fs.writeFileSync(distPath, 'module.exports = { registry: {} }')
  
  const result = findRegistryPath(tmpDir)
  
  // Should prefer src/registries.ts first, then src/registry.ts
  assert.strictEqual(result, srcPath)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

test('findRegistryPath finds src/registries.ts before src/registry.ts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
  
  const srcDir = path.join(tmpDir, 'src')
  fs.mkdirSync(srcDir)
  
  const registriesPath = path.join(srcDir, 'registries.ts')
  fs.writeFileSync(registriesPath, 'export const registry = {}')
  
  const registryPath = path.join(srcDir, 'registry.ts')
  fs.writeFileSync(registryPath, 'export const registry = {}')
  
  const result = findRegistryPath(tmpDir)
  
  assert.strictEqual(result, registriesPath)
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true })
})

