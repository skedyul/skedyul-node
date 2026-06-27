import * as fs from 'fs'
import * as path from 'path'
import type { SkedyulConfig, SerializableSkedyulConfig } from '../config/app-config'
import type { QueueConfig, SerializableQueueConfig } from '../config/queue-config'

let cachedRuntimeQueues: Record<string, SerializableQueueConfig> | null = null

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
 * Register in-process server config for queue resolution at runtime.
 */
export function registerQueueConfig(config: SkedyulConfig): void {
  registeredServerConfig = config
  cachedRuntimeQueues = config.queues ?? null
}

export function clearRegisteredQueueConfig(): void {
  registeredServerConfig = null
  cachedRuntimeQueues = null
}

export function getQueueDefinitions(): Record<string, SerializableQueueConfig> {
  if (cachedRuntimeQueues) {
    return cachedRuntimeQueues
  }

  if (registeredServerConfig?.queues) {
    cachedRuntimeQueues = stripNonSerializableQueues(registeredServerConfig.queues)
    return cachedRuntimeQueues
  }

  const fileConfig = loadRuntimeConfigFile()
  if (fileConfig?.queues) {
    cachedRuntimeQueues = fileConfig.queues
    return cachedRuntimeQueues
  }

  return {}
}

function stripNonSerializableQueues(
  queues: Record<string, QueueConfig>,
): Record<string, SerializableQueueConfig> {
  const result: Record<string, SerializableQueueConfig> = {}
  for (const [name, config] of Object.entries(queues)) {
    const { shouldRetry: _shouldRetry, ...serializable } = config
    result[name] = serializable
  }
  return result
}

export function getQueueConfig(queueName: string): SerializableQueueConfig | undefined {
  return getQueueDefinitions()[queueName]
}

export function getQueueConfigWithRetry(
  queueName: string,
): QueueConfig | undefined {
  const fromServer = registeredServerConfig?.queues?.[queueName]
  if (fromServer) {
    return fromServer
  }
  const serializable = getQueueConfig(queueName)
  return serializable
}
