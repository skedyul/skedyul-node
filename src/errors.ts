/**
 * Error types for install handlers.
 *
 * These errors can be thrown by install handlers to indicate specific failure modes.
 * The server will recognize these errors and return structured error responses
 * that the frontend can display inline on the install form.
 */

export type InstallErrorCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_CONFIGURATION'
  | 'CONNECTION_FAILED'

/**
 * Base error class for install handler errors.
 *
 * @example
 * ```typescript
 * throw new InstallError('Something went wrong', 'INVALID_CONFIGURATION')
 * ```
 */
export class InstallError extends Error {
  code: InstallErrorCode
  field?: string // Optional: which field caused the error

  constructor(message: string, code: InstallErrorCode, field?: string) {
    super(message)
    this.name = 'InstallError'
    this.code = code
    this.field = field
  }
}

/**
 * Error thrown when a required field is missing.
 *
 * @example
 * ```typescript
 * if (!ctx.env.API_KEY) {
 *   throw new MissingRequiredFieldError('API_KEY')
 * }
 * ```
 */
export class MissingRequiredFieldError extends InstallError {
  constructor(fieldName: string, message?: string) {
    super(
      message ?? `${fieldName} is required`,
      'MISSING_REQUIRED_FIELD',
      fieldName,
    )
    this.name = 'MissingRequiredFieldError'
  }
}

/**
 * Error thrown when authentication/credential verification fails.
 *
 * @example
 * ```typescript
 * try {
 *   await apiClient.verifyCredentials()
 * } catch (error) {
 *   throw new AuthenticationError('Invalid API credentials. Please check your username and password.')
 * }
 * ```
 */
export class AuthenticationError extends InstallError {
  constructor(message?: string) {
    super(message ?? 'Authentication failed', 'AUTHENTICATION_FAILED')
    this.name = 'AuthenticationError'
  }
}

/**
 * Error thrown when the configuration is invalid.
 *
 * @example
 * ```typescript
 * if (!isValidUrl(ctx.env.API_URL)) {
 *   throw new InvalidConfigurationError('API_URL', 'Invalid URL format')
 * }
 * ```
 */
export class InvalidConfigurationError extends InstallError {
  constructor(fieldName?: string, message?: string) {
    super(
      message ?? 'Invalid configuration',
      'INVALID_CONFIGURATION',
      fieldName,
    )
    this.name = 'InvalidConfigurationError'
  }
}

/**
 * Error thrown when a connection to an external service fails.
 *
 * @example
 * ```typescript
 * try {
 *   await fetch(apiUrl)
 * } catch (error) {
 *   throw new ConnectionError('Unable to connect to the API server. Please check the URL.')
 * }
 * ```
 */
export class ConnectionError extends InstallError {
  constructor(message?: string) {
    super(
      message ?? 'Connection failed',
      'CONNECTION_FAILED',
    )
    this.name = 'ConnectionError'
  }
}
