/**
 * The one response shape every API route uses.
 *
 *   success: { "ok": true,  "data": ... }
 *   failure: { "ok": false, "error": { "code", "message", "details"?, "requestId" } }
 *
 * API responses are never cached by browsers or Cloudflare unless a route opts in.
 */
import type { ApiResponse } from '../../types/api'

export type { ApiFailure, ApiResponse, ApiSuccess } from '../../types/api'

const baseHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

export function json<T>(body: ApiResponse<T>, status: number, requestId: string, headers: HeadersInit = {}) {
  const h = new Headers({ ...baseHeaders, ...Object.fromEntries(new Headers(headers)) })
  h.set('x-request-id', requestId)
  return new Response(JSON.stringify(body), { status, headers: h })
}

export function ok<T>(data: T, requestId: string, init: { status?: number; headers?: HeadersInit } = {}) {
  return json<T>({ ok: true, data }, init.status ?? 200, requestId, init.headers)
}

export function fail(status: number, code: string, message: string, requestId: string, details?: unknown, headers?: HeadersInit) {
  const error = details === undefined ? { code, message, requestId } : { code, message, details, requestId }
  return json<never>({ ok: false, error }, status, requestId, headers)
}
