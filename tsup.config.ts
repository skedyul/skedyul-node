import { defineConfig } from 'tsup'
import { builtinModules } from 'module'

// CLI-only dependencies (ngrok for tunneling, open for browser, tsx/esbuild for dev)
const cliExternals = ['@ngrok/ngrok', 'open', 'tsx', 'esbuild']

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
  // Serverless ESM server build (for Lambda containers)
  // No CLI dependencies needed here
  {
    entry: { 'server': 'src/server.ts' },
    format: ['esm'],
    outDir: 'dist/serverless',
    dts: false,
    clean: false,
    external: [...builtinModules, ...builtinModules.map(m => `node:${m}`)],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },
  // Dedicated CJS server build (for ECS/Docker containers)
  // No CLI dependencies needed here
  {
    entry: { 'server': 'src/server.ts' },
    format: ['cjs'],
    outDir: 'dist/dedicated',
    dts: false,
    clean: false,
    external: [...builtinModules],
  },
])
