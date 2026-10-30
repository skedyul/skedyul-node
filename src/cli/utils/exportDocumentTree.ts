import * as fs from 'fs'
import * as path from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export type DocumentFileMap = Record<string, string>

function localHandle(handle: string): string {
  return handle.includes('/')
    ? handle.slice(handle.lastIndexOf('/') + 1)
    : handle
}

function exampleStem(example: unknown, index: number): string {
  if (example && typeof example === 'object' && !Array.isArray(example)) {
    const name = (example as { name?: unknown }).name
    if (typeof name === 'string' && name.trim()) {
      return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    }
  }
  return String(index + 1).padStart(2, '0')
}

function scenarioStem(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function exportSkillYamlToFiles(
  config: Record<string, unknown>,
): DocumentFileMap {
  const handle = config.handle
  if (typeof handle !== 'string' || handle.length === 0) {
    throw new Error('skill YAML is missing handle')
  }
  const local = localHandle(handle)
  const rest = { ...config }
  const instructions =
    typeof rest.instructions === 'string' ? rest.instructions : ''
  delete rest.instructions
  const examples = Array.isArray(rest.examples) ? rest.examples : []
  delete rest.examples

  const files: DocumentFileMap = {
    [`skills/${local}/skill.yml`]: stringifyYaml(rest, {
      lineWidth: 0,
      defaultKeyType: 'PLAIN',
    }),
    [`skills/${local}/instructions.md`]: instructions.endsWith('\n')
      ? instructions
      : `${instructions}\n`,
  }
  examples.forEach((example, index) => {
    files[`skills/${local}/examples/${exampleStem(example, index)}.yml`] =
      stringifyYaml(example, { lineWidth: 0, defaultKeyType: 'PLAIN' })
  })
  return files
}

export function exportAgentYamlToFiles(
  config: Record<string, unknown>,
  scenarios: Array<Record<string, unknown>> = [],
): DocumentFileMap {
  const handle = config.handle
  if (typeof handle !== 'string' || handle.length === 0) {
    throw new Error('agent YAML is missing handle')
  }
  const local = localHandle(handle)
  const rest = { ...config }
  delete rest.scenarios
  const files: DocumentFileMap = {
    [`agents/${local}/agent.yml`]: stringifyYaml(rest, {
      lineWidth: 0,
      defaultKeyType: 'PLAIN',
    }),
  }
  for (const scenario of scenarios) {
    const name =
      typeof scenario.name === 'string' && scenario.name.trim()
        ? scenario.name
        : 'scenario'
    files[`agents/${local}/scenarios/${scenarioStem(name)}.yml`] = stringifyYaml(
      scenario,
      { lineWidth: 0, defaultKeyType: 'PLAIN' },
    )
  }
  return files
}

export function writeDocumentFiles(
  rootDir: string,
  files: DocumentFileMap,
): string[] {
  const written: string[] = []
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(rootDir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
    written.push(rel)
  }
  return written
}

export function parseYamlMapping(content: string): Record<string, unknown> {
  const parsed = parseYaml(content)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML must be a mapping')
  }
  return parsed as Record<string, unknown>
}
