import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError, ConfigError, notFound } from '../../src/server/http/errors'
import { ok } from '../../src/server/http/response'
import { onlyMethods, route } from '../../src/server/http/route'
import { parseJsonBody, parseQuery } from '../../src/server/http/validate'

const req = (body?: string, headers: Record<string, string> = {}, url = 'https://shop.test/api/x') =>
  new Request(url, { method: body === undefined ? 'GET' : 'POST', body, headers })

describe('route wrapper and response shape', () => {
  it('wraps success in { ok, data } with no-store and a request id', async () => {
    const res = await route((_r, { requestId }) => ok({ a: 1 }, requestId))(req(undefined, { 'cf-ray': 'ray-1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-request-id')).toBe('ray-1')
    expect(await res.json()).toEqual({ ok: true, data: { a: 1 } })
  })

  it('maps AppErrors to their status and code', async () => {
    const res = await route(() => {
      throw notFound('No such thing.')
    })(req())
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'not_found', message: 'No such thing.' } })
  })

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await route(() => {
      throw new Error('db password is hunter2')
    })(req())
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.error.code).toBe('internal_error')
    expect(JSON.stringify(body)).not.toContain('hunter2')
  })

  it('hides configuration problems from the caller', async () => {
    const res = await route(() => {
      throw new ConfigError('bad', ['DATABASE_URL: not set'])
    })(req())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('DATABASE_URL')
  })

  it('does not expose messages of 5xx AppErrors unless asked to', async () => {
    const res = await route(() => {
      throw new AppError(502, 'service_unavailable', 'upstream said: secret detail')
    })(req())
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
  })

  it('answers unsupported methods with 405 and an Allow header', async () => {
    const res = await onlyMethods('GET')(req('{}'))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET')
  })
})

describe('request validation', () => {
  const schema = z.object({ name: z.string().min(1), qty: z.number().int().positive() })
  const run = (r: Request) => route(async (rq, { requestId }) => ok(await parseJsonBody(rq, schema, 64), requestId))(r)

  it('accepts a valid JSON body', async () => {
    const res = await run(req('{"name":"a","qty":2}', { 'content-type': 'application/json' }))
    expect(await res.json()).toEqual({ ok: true, data: { name: 'a', qty: 2 } })
  })

  it('returns 422 with field errors for invalid input', async () => {
    const res = await run(req('{"name":"","qty":-1}', { 'content-type': 'application/json' }))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(Object.keys(body.error.details)).toEqual(['name', 'qty'])
  })

  it('rejects malformed JSON with 400', async () => {
    expect((await run(req('{nope', { 'content-type': 'application/json' }))).status).toBe(400)
  })

  it('rejects other content types with 415', async () => {
    expect((await run(req('name=a', { 'content-type': 'application/x-www-form-urlencoded' }))).status).toBe(415)
  })

  it('rejects bodies over the limit with 413, even without a content-length', async () => {
    expect((await run(req(JSON.stringify({ name: 'x'.repeat(200), qty: 1 }), { 'content-type': 'application/json' }))).status).toBe(413)
  })

  it('validates query strings', async () => {
    const q = z.object({ page: z.coerce.number().int().min(1) })
    expect(parseQuery(req(undefined, {}, 'https://s.test/?page=3'), q)).toEqual({ page: 3 })
    expect(() => parseQuery(req(undefined, {}, 'https://s.test/?page=0'), q)).toThrow(AppError)
  })
})
