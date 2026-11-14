import 'server-only'
import { getServerEnv } from '../env'
import { createLogger, type Logger } from '../log'
import { AppError, ConfigError, methodNotAllowed } from './errors'
import { fail } from './response'

export type RouteContext<P = Record<string, string | string[]>> = {
  requestId: string
  log: Logger
  params: P
}

type Handler<P> = (request: Request, ctx: RouteContext<P>) => Promise<Response> | Response

/**
 * Wraps a Next.js route handler with the shared API behaviour:
 * a request id on every response, one structured log line per request, and every thrown
 * error turned into the standard error shape. Unexpected errors become a generic 500;
 * their details go to the log, never to the caller.
 *
 *   export const GET = route(async (req, { requestId }) => ok({ hello: 'world' }, requestId))
 */
export function route<P = Record<string, string | string[]>>(handler: Handler<P>) {
  return async (request: Request, nextCtx?: { params?: Promise<P> }): Promise<Response> => {
    const started = Date.now()
    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID()
    const url = new URL(request.url)
    const log = createLogger({ requestId, method: request.method, path: url.pathname }, logLevel())
    let response: Response
    try {
      const params = ((await nextCtx?.params) ?? {}) as P
      response = await handler(request, { requestId, log, params })
    } catch (error) {
      response = toErrorResponse(error, requestId, log)
    }
    log.info('request', { status: response.status, ms: Date.now() - started })
    return response
  }
}

/** Responds 405 with an Allow header. Use for methods a route does not support. */
export function onlyMethods(...allowed: string[]) {
  return route(() => {
    throw methodNotAllowed(allowed)
  })
}

export function toErrorResponse(error: unknown, requestId: string, log: Logger) {
  if (error instanceof ConfigError) {
    log.error('configuration error', { problems: error.problems })
    return fail(500, 'internal_error', 'Something went wrong on our side.', requestId)
  }
  if (error instanceof AppError) {
    if (error.status >= 500) log.error(error.message, { code: error.code, cause: error.cause })
    const headers = error.code === 'method_not_allowed' ? { allow: (error.details as { allowed: string[] }).allowed.join(', ') } : undefined
    return error.expose
      ? fail(error.status, error.code, error.message, requestId, error.details, headers)
      : fail(error.status, error.code, 'Something went wrong on our side.', requestId)
  }
  log.error('unhandled error', { error })
  return fail(500, 'internal_error', 'Something went wrong on our side.', requestId)
}

function logLevel() {
  try {
    return getServerEnv().LOG_LEVEL
  } catch {
    return 'info' as const
  }
}
