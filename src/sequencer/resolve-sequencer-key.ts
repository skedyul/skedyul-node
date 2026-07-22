import type { RateLimitExecutionContext } from '../ratelimit/types'
import type { SerializableSequencerConfig } from '../config/sequencer-config'
import { SequencerContextError } from './errors'

function resolveEndpointHandle(
  config: SerializableSequencerConfig,
  invocation?: RateLimitExecutionContext['invocation'],
): string {
  if (config.endpoint) {
    return config.endpoint
  }
  if (invocation?.toolHandle) {
    return invocation.toolHandle
  }
  if (invocation?.serverHookHandle) {
    return invocation.serverHookHandle
  }
  throw new SequencerContextError(
    `Cannot resolve endpoint handle for sequencer scope "${config.scope}". ` +
      'Set endpoint in sequencer config or ensure invocation.toolHandle/serverHookHandle is available.',
  )
}

function appendSubKey(base: string, subKey?: string): string {
  return subKey ? `${base}:${subKey}` : base
}

/**
 * Build the Redis sequencer key for a named sequencer definition.
 * Must stay in sync with skedyul-core sequencer validation.
 */
export function resolveSequencerKey(
  sequencerName: string,
  config: SerializableSequencerConfig,
  ctx: RateLimitExecutionContext,
  subKey?: string,
): string {
  const { app, appInstallationId, invocation, isProvisionContext } = ctx

  switch (config.scope) {
    case 'provision': {
      const base = `seq:pv:${app.versionId}:${sequencerName}`
      return appendSubKey(base, subKey)
    }
    case 'install': {
      if (!appInstallationId) {
        throw new SequencerContextError(
          `Sequencer "${sequencerName}" with scope "install" requires appInstallationId in context`,
        )
      }
      const base = `seq:in:${appInstallationId}:${sequencerName}`
      return appendSubKey(base, subKey)
    }
    case 'provision_endpoint': {
      if (!isProvisionContext && appInstallationId) {
        throw new SequencerContextError(
          `Sequencer "${sequencerName}" with scope "provision_endpoint" requires provision context (no install)`,
        )
      }
      const endpointHandle = resolveEndpointHandle(config, invocation)
      const base = `seq:pep:${app.versionId}:${endpointHandle}:${sequencerName}`
      return appendSubKey(base, subKey)
    }
    case 'install_endpoint': {
      if (!appInstallationId) {
        throw new SequencerContextError(
          `Sequencer "${sequencerName}" with scope "install_endpoint" requires appInstallationId in context`,
        )
      }
      const endpointHandle = resolveEndpointHandle(config, invocation)
      const base = `seq:iep:${appInstallationId}:${endpointHandle}:${sequencerName}`
      return appendSubKey(base, subKey)
    }
    case 'global': {
      const base = `seq:gl:${app.versionId}:${sequencerName}`
      return appendSubKey(base, subKey)
    }
    default: {
      const _exhaustive: never = config.scope
      throw new SequencerContextError(`Unknown sequencer scope: ${String(_exhaustive)}`)
    }
  }
}
