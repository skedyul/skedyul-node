import { defineConfig } from 'tsup'
import { builtinModules } from 'module'

// CLI-only dependencies (ngrok for tunneling, open for browser, tsx/esbuild for dev)
const cliExternals = ['@ngrok/ngrok', 'open', 'tsx', 'esbuild']

// Common externals for ESM builds to avoid bundling issues
const esmExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  '@modelcontextprotocol/sdk',
  '@modelcontextprotocol/sdk/server/mcp.js',
  '@modelcontextprotocol/sdk/server/streamableHttp.js',
  'zod',
  'zod/v4',
]

export default defineConfig([
  // Main CJS build (CLI, types, config definitions, core API)
  // This is what worker-compute, skedyul-workflows, skedyul-core use
  // Also includes server.ts for type definitions
  // Note: clean is false because tsc generates .d.ts files first
  {
    entry: ['src/index.ts', 'src/cli/index.ts', 'src/server.ts'],
    format: ['cjs'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, ...cliExternals],
  },
  // CLI utils build (for skedyul-mcp and other packages that need auth utilities)
  // Exported via package.json "exports" field as "./cli/utils/auth"
  {
    entry: { 'cli/utils/auth': 'src/cli/utils/auth.ts' },
    format: ['cjs'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, ...cliExternals],
  },
  // Config loader build (CLI-only; uses esbuild and must not ship in main bundle)
  {
    entry: { 'config/loader': 'src/config/loader.ts' },
    format: ['cjs', 'esm'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, ...cliExternals],
  },
  // Schemas build (for agent-schema and other shared schemas)
  // Exported via package.json "exports" field as "./schemas/agent-schema"
  {
    entry: { 'schemas/agent-schema': 'src/schemas/agent-schema.ts' },
    format: ['cjs'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, 'zod', 'zod/v4'],
  },
  // Agent Schema v3 CJS build
  {
    entry: { 'schemas/agent-schema-v3': 'src/schemas/agent-schema-v3.ts' },
    format: ['cjs'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, 'zod', 'zod/v4'],
  },
  // Skills types CJS build
  {
    entry: { 'skills/types': 'src/skills/types.ts' },
    format: ['cjs'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, 'zod', 'zod/v4'],
  },
  // Scheduling CJS build (workflow-safe, no Node.js APIs)
  {
    entry: { 'scheduling/index': 'src/scheduling/index.ts' },
    format: ['cjs'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, 'zod', 'zod/v4'],
  },
  // Estimation CJS build (workflow-safe, no esbuild/tsx)
  {
    entry: { 'estimation/index': 'src/estimation/index.ts' },
    format: ['cjs'],
    outDir: 'dist',
    dts: false,
    splitting: false,
    clean: false,
    external: [...builtinModules, 'zod', 'zod/v4'],
  },
  // Schemas ESM build (for ESM packages like skedyul-mcp)
  {
    entry: { 'agent-schema': 'src/schemas/agent-schema.ts' },
    format: ['esm'],
    outDir: 'dist/schemas',
    dts: false,
    splitting: false,
    clean: false,
    external: [...esmExternals],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },
  // Agent Schema v3 ESM build
  {
    entry: { 'agent-schema-v3': 'src/schemas/agent-schema-v3.ts' },
    format: ['esm'],
    outDir: 'dist/schemas',
    dts: false,
    splitting: false,
    clean: false,
    external: [...esmExternals],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },
  // Skills types ESM build
  {
    entry: { types: 'src/skills/types.ts' },
    format: ['esm'],
    outDir: 'dist/skills',
    dts: false,
    splitting: false,
    clean: false,
    external: [...esmExternals],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },
  // Scheduling ESM build (workflow-safe, no Node.js APIs)
  // Note: No 'module' banner - this needs to be bundleable in Temporal workflows
  {
    entry: { index: 'src/scheduling/index.ts' },
    format: ['esm'],
    outDir: 'dist/scheduling',
    dts: false,
    splitting: false,
    clean: false,
    external: ['zod', 'zod/v4'],
  },
  // Estimation ESM build (workflow-safe, no esbuild/tsx)
  {
    entry: { index: 'src/estimation/index.ts' },
    format: ['esm'],
    outDir: 'dist/estimation',
    dts: false,
    splitting: false,
    clean: false,
    external: ['zod', 'zod/v4'],
  },
  // Main ESM build for integrations that use "type": "module"
  // This prevents double-loading when serverless integrations import from 'skedyul'
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist/esm',
    dts: false,
    splitting: false,
    clean: false,
    external: [...esmExternals, ...cliExternals],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },
  // Serverless ESM server build (for Lambda containers)
  // Externalize MCP SDK and zod to avoid bundling issues in ESM
  {
    entry: { server: 'src/server.ts' },
    format: ['esm'],
    outDir: 'dist/serverless',
    dts: false,
    clean: false,
    external: esmExternals,
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },
  // Dedicated CJS server build (for ECS/Docker containers)
  // No CLI dependencies needed here
  {
    entry: { server: 'src/server.ts' },
    format: ['cjs'],
    outDir: 'dist/dedicated',
    dts: false,
    clean: false,
    external: [...builtinModules],
  },
])
