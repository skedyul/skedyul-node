/**
 * Default tsup.config.ts templates for integrations
 * =================================================
 *
 * These templates are used when an integration doesn't provide its own tsup.config.ts.
 * The Dockerfile generates the appropriate config based on the COMPUTE_LAYER build arg.
 *
 * Note: Integration-specific externals (like 'twilio') should be specified in
 * skedyul.config.ts via the build.external option, not hardcoded here.
 */

export const TSUP_CONFIG_SERVERLESS = `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server/mcp_server.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist/server',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  external: ['skedyul', 'skedyul/serverless', 'zod'],
})
`

export const TSUP_CONFIG_DEDICATED = `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server/mcp_server.ts'],
  format: ['cjs'],
  target: 'node22',
  outDir: 'dist/server',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  external: ['skedyul', 'skedyul/dedicated', 'zod'],
})
`
