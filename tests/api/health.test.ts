import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/server/db/client', () => ({
  getDb: vi.fn(() => ({})),
  pingDatabase: vi.fn(async () => ({ latencyMs: 12 })),
}))

const TOKEN = 't'.repeat(40)
const saved = { ...process.env }

async function call(url: string, headers: Record<string, string> = {}, method = 'GET') {
  vi.resetModules()
  const mod = await import('../../src/app/api/health/route')
  const handler = mod[method as 'GET']
  return handler(new Request(`https://shop.test${url}`, { method, headers }))
}

describe('GET /api/health', () => {
  beforeEach(() => {
    process.env.APP_ENV = 'preview'
    process.env.DATABASE_URL = 'postgresql://u:p@ep-x.neon.tech/neondb'
    process.env.HEALTH_CHECK_TOKEN = TOKEN
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('reports status without touching the database', async () => {
    const { pingDatabase } = await import('../../src/server/db/client')
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, data: { status: 'ok', store: 'abzari-paris', environment: 'preview', database: 'configured' } })
    expect(pingDatabase).not.toHaveBeenCalled()
  })

  it('refuses the database check without the token', async () => {
    expect((await call('/api/health?checks=db')).status).toBe(403)
    expect((await call('/api/health?checks=db', { 'x-health-token': 'wrong' })).status).toBe(403)
  })

  it('runs the database check with the token', async () => {
    const res = await call('/api/health?checks=db', { 'x-health-token': TOKEN })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ database: 'reachable', databaseLatencyMs: 12 })
  })

  it('rejects unknown checks with 422', async () => {
    expect((await call('/api/health?checks=everything')).status).toBe(422)
  })

  it('answers 500 without details when configuration is invalid', async () => {
    process.env.APP_ENV = 'staging'
    const res = await call('/api/health')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/APP_ENV|staging/)
  })

  it('rejects other methods with 405', async () => {
    expect((await call('/api/health', {}, 'POST')).status).toBe(405)
  })
})
