/**
 * Errors that API handlers throw on purpose. Each carries a stable machine-readable `code`
 * and the HTTP status it maps to. The message is safe to show to the caller; anything that
 * is not an AppError becomes a generic 500 so internal details never leak.
 */
export type ErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'service_unavailable'
  | 'internal_error'

export class AppError extends Error {
  readonly status: number
  readonly code: ErrorCode
  /** Safe, structured detail for the caller, e.g. which fields failed validation. */
  readonly details?: unknown
  /** Whether the message may be shown to the caller. False for unexpected errors. */
  readonly expose: boolean

  constructor(status: number, code: ErrorCode, message: string, options: { details?: unknown; expose?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = options.details
    this.expose = options.expose ?? status < 500
  }
}

/** Server misconfiguration: missing or invalid environment variables. Never exposed. */
export class ConfigError extends AppError {
  readonly problems: string[]
  constructor(message: string, problems: string[]) {
    super(500, 'internal_error', message, { expose: false })
    this.name = 'ConfigError'
    this.problems = problems
  }
}

export const badRequest = (message = 'The request is not valid.', details?: unknown) => new AppError(400, 'bad_request', message, { details })
export const validationFailed = (details: unknown) => new AppError(422, 'validation_failed', 'Some fields are not valid.', { details })
export const unauthorized = (message = 'Authentication is required.') => new AppError(401, 'unauthorized', message)
export const forbidden = (message = 'You do not have access to this.') => new AppError(403, 'forbidden', message)
export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message)
export const methodNotAllowed = (allowed: string[]) =>
  new AppError(405, 'method_not_allowed', 'This method is not allowed here.', { details: { allowed } })
export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, { details })
export const payloadTooLarge = (limitBytes: number) =>
  new AppError(413, 'payload_too_large', 'The request body is too large.', { details: { limitBytes } })
export const unsupportedMediaType = (expected: string) =>
  new AppError(415, 'unsupported_media_type', `Expected ${expected}.`)
export const serviceUnavailable = (message = 'A service this needs is unavailable. Try again shortly.') =>
  new AppError(503, 'service_unavailable', message, { expose: true })
