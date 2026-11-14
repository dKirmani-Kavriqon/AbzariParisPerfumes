import { describe, expect, it, vi } from 'vitest'
import { getServerEnv } from '../../src/server/env'
import { api } from '../../src/server/api/routes'
import type { ApiDeps } from '../../src/server/api/deps'

vi.mock('../../src/server/db/client', () => ({
  getDb: vi.fn(() => ({})),
  pingDatabase: vi.fn(async () => ({ latencyMs: 12 })),
}))

const TOKEN = 't'.repeat(40)
const baseEnv = { APP_ENV: 'preview', DATABASE_URL: 'postgresql://u:p@ep-x.neon.tech/neondb', HEALTH_CHECK_TOKEN: TOKEN }

const deps = (env: Record<string, string | undefined> = baseEnv): ApiDeps => ({
  db: () => ({}) as never,
  env: () => getServerEnv(env),
  storeCode: 'abzari-paris',
  storeName: 'Abzari Paris',
  objectStore: () => null,
  fetch,
})
const call = (url: string, init: RequestInit = {}, env?: Record<string, string | undefined>) => api().handle(new Request(`https://shop.test${url}`, init), deps(env))

describe('GET /api/health', () => {
  it('reports status without touching the database', async () => {
    const { pingDatabase } = await import('../../src/server/db/client')
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, data: { status: 'ok', store: 'abzari-paris', environment: 'preview', database: 'configured' } })
    expect(pingDatabase).not.toHaveBeenCalled()
  })

  it('refuses the database check without the token, and runs it with the token', async () => {
    expect((await call('/api/health?checks=db')).status).toBe(403)
    expect((await call('/api/health?checks=db', { headers: { 'x-health-token': 'wrong' } })).status).toBe(403)
    const res = await call('/api/health?checks=db', { headers: { 'x-health-token': TOKEN } })
    expect((await res.json()).data).toMatchObject({ database: 'reachable', databaseLatencyMs: 12 })
  })

  it('rejects unknown checks with 422 and other methods with 405', async () => {
    expect((await call('/api/health?checks=everything')).status).toBe(422)
    const res = await call('/api/health', { method: 'POST' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET')
  })

  it('answers 500 without details when configuration is invalid', async () => {
    const res = await call('/api/health', {}, { ...baseEnv, APP_ENV: 'staging' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/APP_ENV|staging/)
  })

  it('returns the JSON 404 for unknown API paths, with security headers', async () => {
    const res = await call('/api/nope')
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
