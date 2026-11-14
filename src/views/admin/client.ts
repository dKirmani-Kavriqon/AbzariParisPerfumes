'use client'

import type { ApiResponse } from '../../types/api'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; fields: Record<string, string> }

/**
 * Calls the admin API. Always sends the header the server requires for admin writes (CSRF
 * protection) and turns error responses into a message plus per-field messages.
 */
export async function adminApi<T>(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<ApiResult<T>> {
  const method = init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET')
  const headers: Record<string, string> = { 'x-requested-with': 'kce-admin' }
  let body: BodyInit | undefined
  if (init.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(init.json)
  } else if (init.form) body = init.form
  let res: Response
  try {
    res = await fetch(path, { method, headers, body, credentials: 'same-origin', cache: 'no-store' })
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server. Check your connection.', fields: {} }
  }
  let payload: ApiResponse<T> | undefined
  try {
    payload = (await res.json()) as ApiResponse<T>
  } catch {
    return { ok: false, status: res.status, message: `Unexpected response (${res.status}).`, fields: {} }
  }
  if (payload.ok) return { ok: true, data: payload.data }
  const details = payload.error.details
  const fields = details && typeof details === 'object' && !Array.isArray(details) ? (Object.fromEntries(Object.entries(details).filter(([, v]) => typeof v === 'string')) as Record<string, string>) : {}
  return { ok: false, status: res.status, message: payload.error.message, fields }
}
