import * as fs from 'fs'
import * as path from 'path'
import type { SkedyulConfig, SerializableSkedyulConfig } from '../config/app-config'
import type { SerializableSequencerConfig } from '../config/sequencer-config'

let cachedRuntimeSequencers: Record<string, SerializableSequencerConfig> | null = null

function getRuntimeConfigPath(): string {
  if (process.env.LAMBDA_TASK_ROOT) {
    return path.join(process.env.LAMBDA_TASK_ROOT, '.skedyul', 'config.json')
  }
  return path.join(process.cwd(), '.skedyul', 'config.json')
}

function loadRuntimeConfigFile(): SerializableSkedyulConfig | null {
  const configPath = getRuntimeConfigPath()
  if (!fs.existsSync(configPath)) {
    return null
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as SerializableSkedyulConfig
  } catch {
    return null
  }
}

let registeredServerConfig: SkedyulConfig | null = null

/**
 * Register in-process server config for sequencer resolution at runtime.
 */
export function registerSequencerConfig(config: SkedyulConfig): void {
  registeredServerConfig = config
  cachedRuntimeSequencers = config.sequencers ?? null
}

export function clearRegisteredSequencerConfig(): void {
  registeredServerConfig = null
  cachedRuntimeSequencers = null
}

export function getSequencerDefinitions(): Record<string, SerializableSequencerConfig> {
  if (cachedRuntimeSequencers) {
    return cachedRuntimeSequencers
  }

  if (registeredServerConfig?.sequencers) {
    cachedRuntimeSequencers = registeredServerConfig.sequencers
    return cachedRuntimeSequencers
  }

  const fileConfig = loadRuntimeConfigFile()
  if (fileConfig?.sequencers) {
    cachedRuntimeSequencers = fileConfig.sequencers
    return cachedRuntimeSequencers
  }

  return {}
}

export function getSequencerConfig(
  sequencerName: string,
): SerializableSequencerConfig | undefined {
  return getSequencerDefinitions()[sequencerName]
}
