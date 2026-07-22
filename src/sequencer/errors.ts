export class SequencerContextError extends Error {
  readonly code = 'SEQUENCER_CONTEXT_ERROR'

  constructor(message: string) {
    super(message)
    this.name = 'SequencerContextError'
  }
}

export class SequencerNotFoundError extends Error {
  readonly code = 'SEQUENCER_NOT_FOUND'

  constructor(name: string) {
    super(`Sequencer "${name}" is not defined in skedyul.config`)
    this.name = 'SequencerNotFoundError'
  }
}

export class SequencerBackendError extends Error {
  readonly code = 'SEQUENCER_BACKEND_ERROR'
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'SequencerBackendError'
    this.statusCode = statusCode
  }
}

export class SequencerLockError extends Error {
  readonly code = 'SEQUENCER_LOCK_ERROR'

  constructor(message: string) {
    super(message)
    this.name = 'SequencerLockError'
  }
}
