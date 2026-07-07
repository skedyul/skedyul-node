import * as esbuild from 'esbuild'
import * as fs from 'fs'
import * as path from 'path'

const SKEDYUL_SHIM_NAMESPACE = 'skedyul-shim'
const METADATA_STUB_NAMESPACE = 'metadata-stub'

function prepareConfigSource(content: string): string {
  // Dynamic import() loads full registries at runtime; metadata-only loads must not execute them.
  return content.replace(/import\s*\(\s*(['"])([^'"]+)\1\s*\)/g, 'Promise.resolve(null)')
}

function isJsonImport(importPath: string): boolean {
  return importPath.endsWith('.json')
}

export async function transpileConfigMetadata(configPath: string): Promise<string> {
  const absolutePath = path.resolve(configPath)
  const configDir = path.dirname(absolutePath)
  const configBasename = path.basename(absolutePath)

  const result = await esbuild.build({
    absWorkingDir: configDir,
    entryPoints: [absolutePath],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'prepare-config-entry',
        setup(build) {
          build.onLoad({ filter: new RegExp(`/${configBasename.replace('.', '\\.')}$`) }, () => ({
            contents: prepareConfigSource(fs.readFileSync(absolutePath, 'utf-8')),
            loader: 'ts',
          }))
        },
      },
      {
        name: 'skedyul-shim',
        setup(build) {
          build.onResolve({ filter: /^skedyul$/ }, () => ({
            path: 'skedyul-shim',
            namespace: SKEDYUL_SHIM_NAMESPACE,
          }))

          build.onLoad({ filter: /.*/, namespace: SKEDYUL_SHIM_NAMESPACE }, () => ({
            contents: [
              'function defineConfig(config) { return config; }',
              'module.exports = { defineConfig };',
            ].join('\n'),
            loader: 'js',
          }))
        },
      },
      {
        name: 'metadata-stub-imports',
        setup(build) {
          build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
            if (isJsonImport(args.path)) {
              return undefined
            }
            return {
              path: args.path,
              namespace: METADATA_STUB_NAMESPACE,
            }
          })

          build.onLoad({ filter: /.*/, namespace: METADATA_STUB_NAMESPACE }, () => ({
            contents: 'module.exports = {};\n',
            loader: 'js',
          }))
        },
      },
    ],
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors.map((error) => error.text).join('\n'))
  }

  if (result.outputFiles.length === 0) {
    throw new Error('Config transpile produced no output')
  }

  return result.outputFiles[0].text
}
