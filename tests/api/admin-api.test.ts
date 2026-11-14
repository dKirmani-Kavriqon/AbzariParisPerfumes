import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearStoreCache } from '../../src/commerce/catalog/store'
import type { ApiDeps } from '../../src/server/api/deps'
import { buildApi } from '../../src/server/api/routes'
import { clearAccessKeyCache } from '../../src/server/auth/admin'
import type { Db } from '../../src/server/db/types'
import { getServerEnv } from '../../src/server/env'
import { memoryStore } from '../../src/server/storage/object-store'
import { createTestDb, newStore, uniq } from '../helpers/db'

let db: Db
let close: () => Promise<void>
let storeCode: string
const api = buildApi()
const objects = memoryStore()

const LOCAL_DEV = { APP_ENV: 'development', ADMIN_LOCAL_DEV: '1' }
const TEAM = 'kavriqon-test.cloudflareaccess.com'
const AUD = 'a'.repeat(64)

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
  storeCode = (await newStore(db)).code
  clearStoreCache()
}, 60_000)
afterAll(() => close())

function deps(env: Record<string, string | undefined> = LOCAL_DEV, opts: { objects?: ReturnType<typeof memoryStore> | null; fetch?: typeof fetch } = {}): ApiDeps {
  return {
    db: () => db,
    env: () => getServerEnv(env),
    storeCode,
    storeName: 'Test store',
    objectStore: () => (opts.objects === undefined ? objects : opts.objects),
    fetch: opts.fetch ?? (() => Promise.reject(new Error('no network in tests'))),
  }
}

type Init = { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string>; host?: string }
async function call(path: string, init: Init = {}, d: ApiDeps = deps()) {
  const method = init.method ?? (init.json !== undefined ? 'POST' : 'GET')
  const headers: Record<string, string> = { ...(method !== 'GET' ? { 'x-requested-with': 'kce-admin' } : {}), ...init.headers }
  let body = init.body
  if (init.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(init.json)
  }
  const res = await api.handle(new Request(`http://${init.host ?? 'localhost'}:3000${path}`, { method, headers, body }), d)
  const text = await res.text()
  let data: { ok: boolean; data?: any; error?: any } | undefined
  try {
    data = JSON.parse(text)
  } catch {
    data = undefined
  }
  return { status: res.status, headers: res.headers, body: data, raw: text }
}

describe('admin access boundary', () => {
  it('refuses every admin call on a deployed environment without Access configured', async () => {
    const r = await call('/api/admin/products', {}, deps({ APP_ENV: 'preview', ADMIN_LOCAL_DEV: '1' }))
    expect(r.status).toBe(403)
    expect(r.body?.error.message).toMatch(/not configured/)
  })

  it('only honours the local-development switch on localhost in development', async () => {
    expect((await call('/api/admin/products', { host: 'abzari-paris-preview.abzaric1.workers.dev' })).status).toBe(403)
    expect((await call('/api/admin/products', {}, deps({ APP_ENV: 'development' }))).status).toBe(403)
    expect((await call('/api/admin/products')).status).toBe(200)
  })

  it('blocks cross-site writes', async () => {
    const noHeader = await api.handle(new Request('http://localhost:3000/api/admin/categories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"x"}' }), deps())
    expect(noHeader.status).toBe(403)
    const foreign = await call('/api/admin/categories', { json: { name: 'x' }, headers: { origin: 'https://evil.example' } })
    expect(foreign.status).toBe(403)
  })

  describe('Cloudflare Access tokens', () => {
    let keys: CryptoKeyPair
    let jwks: { keys: JsonWebKey[] }
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    async function sign(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }, key = keys.privateKey) {
      const input = `${enc(header)}.${enc(claims)}`
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
      return `${input}.${Buffer.from(sig).toString('base64url')}`
    }
    const now = () => Math.floor(Date.now() / 1000)
    const good = () => ({ aud: [AUD], iss: `https://${TEAM}`, exp: now() + 300, email: 'Owner@Example.com' })
    const accessEnv = (extra: Record<string, string> = {}) => ({ APP_ENV: 'preview', ADMIN_ACCESS_TEAM_DOMAIN: TEAM, ADMIN_ACCESS_AUD: AUD, ...extra })
    const fakeFetch = (async (url: string) => {
      expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`)
      return new Response(JSON.stringify(jwks))
    }) as unknown as typeof fetch
    const withToken = (token: string, env = accessEnv()) => call('/api/admin/session', { host: 'preview.example', headers: { 'cf-access-jwt-assertion': token } }, deps(env, { fetch: fakeFetch }))

    beforeAll(async () => {
      keys = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
      jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' } as JsonWebKey] }
      clearAccessKeyCache()
    })

    it('accepts a valid signed token and reports who is signed in', async () => {
      const r = await withToken(await sign(good()))
      expect(r.status).toBe(200)
      expect(r.body?.data).toMatchObject({ email: 'owner@example.com', method: 'cloudflare-access' })
    })

    it('rejects missing, malformed, unsigned, tampered, expired and wrong-audience tokens', async () => {
      expect((await call('/api/admin/session', { host: 'preview.example' }, deps(accessEnv(), { fetch: fakeFetch }))).status).toBe(401)
      expect((await withToken('not.a.jwt')).status).toBe(401)
      expect((await withToken(`${enc({ alg: 'none', kid: 'k1' })}.${enc(good())}.`)).status).toBe(401)
      const valid = await sign(good())
      const [h, , s] = valid.split('.')
      expect((await withToken(`${h}.${enc({ ...good(), email: 'attacker@example.com' })}.${s}`)).status).toBe(401)
      expect((await withToken(await sign({ ...good(), exp: now() - 3600 }))).status).toBe(401)
      expect((await withToken(await sign({ ...good(), aud: ['b'.repeat(64)] }))).status).toBe(401)
      expect((await withToken(await sign({ ...good(), iss: 'https://other.cloudflareaccess.com' }))).status).toBe(401)
      const other = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
      expect((await withToken(await sign(good(), undefined, other.privateKey))).status).toBe(401)
    })

    it('applies the optional email allowlist', async () => {
      const token = await sign(good())
      expect((await withToken(token, accessEnv({ ADMIN_EMAILS: 'someone@else.com' }))).status).toBe(403)
      expect((await withToken(token, accessEnv({ ADMIN_EMAILS: 'someone@else.com, owner@example.com' }))).status).toBe(200)
    })
  })
})

describe('catalogue API', () => {
  it('runs the product lifecycle with consistent responses and status codes', async () => {
    const cat = await call('/api/admin/categories', { json: { name: `Parfum ${uniq()}` } })
    expect(cat.status).toBe(201)

    const slug = uniq('api')
    const created = await call('/api/admin/products', {
      json: { name: 'Rawah', slug, brand: 'Abzari Paris', categoryIds: [cat.body!.data.id], variants: [{ sku: uniq('RAW').toUpperCase(), title: '50 ml', priceMinor: 179900, salePriceMinor: 150000, initialStock: 5 }] },
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ ok: true, data: { slug, status: 'draft', variants: [{ priceMinor: 179900, availableQuantity: 5 }] } })
    const id = created.body!.data.id

    const dup = await call('/api/admin/products', { json: { name: 'Again', slug } })
    expect(dup.status).toBe(409)
    expect(dup.body).toMatchObject({ ok: false, error: { code: 'conflict', details: { slug: expect.any(String) }, requestId: expect.any(String) } })

    const invalid = await call('/api/admin/products', { json: { name: '', variants: [{ sku: 'bad sku', priceMinor: -5 }] } })
    expect(invalid.status).toBe(422)
    expect(Object.keys(invalid.body!.error.details)).toEqual(expect.arrayContaining(['name', 'variants.0.sku', 'variants.0.priceMinor']))

    expect((await call(`/api/admin/products/${id}`, { method: 'PATCH', json: { status: 'active', featured: true } })).body?.data).toMatchObject({ status: 'active', featured: true })
    expect((await call(`/api/admin/products?q=${slug}`)).body?.data).toMatchObject({ total: 1, items: [{ id, minPriceMinor: 150000, totalStock: 5 }] })
    expect((await call(`/api/admin/products/${id}/archive`, { method: 'POST' })).body?.data.status).toBe('archived')
    expect((await call(`/api/admin/products/${id}/restore`, { method: 'POST' })).body?.data.status).toBe('draft')
    expect((await call('/api/admin/products/not-a-uuid')).status).toBe(422)
    expect((await call(`/api/admin/products/${crypto.randomUUID()}`)).status).toBe(404)
    expect((await call(`/api/admin/products/${id}`, { method: 'DELETE' })).status).toBe(405)
  })

  it('manages variants, SKU checks and inventory over HTTP', async () => {
    const p = await call('/api/admin/products', { json: { name: `Voyage ${uniq()}` } })
    const pid = p.body!.data.id
    const sku = uniq('VOY').toUpperCase()
    const v = await call(`/api/admin/products/${pid}/variants`, { json: { sku, priceMinor: 150000, initialStock: 2, lowStockThreshold: 3 } })
    expect(v.status).toBe(201)
    const vid = v.body!.data.id
    expect((await call(`/api/admin/products/${pid}/variants`, { json: { sku, priceMinor: 1 } })).status).toBe(409)
    expect((await call(`/api/admin/skus/availability?sku=${sku}`)).body?.data.available).toBe(false)
    expect((await call(`/api/admin/skus/availability?sku=${sku}&excludeVariantId=${vid}`)).body?.data.available).toBe(true)

    const restock = await call(`/api/admin/variants/${vid}/inventory/adjustments`, { json: { type: 'restock', quantityChange: 10, reference: 'INV-1' } })
    expect(restock.body?.data).toMatchObject({ previousQuantity: 2, resultingQuantity: 12 })
    const tooMuch = await call(`/api/admin/variants/${vid}/inventory/adjustments`, { json: { type: 'correction', quantityChange: -50, reason: 'count' } })
    expect(tooMuch.status).toBe(409)
    const inv = await call(`/api/admin/variants/${vid}/inventory`)
    expect(inv.body?.data.stock).toMatchObject({ availableQuantity: 12, lowStockThreshold: 3, isLow: false })
    expect(inv.body?.data.movements.map((m: { movementType: string }) => m.movementType)).toEqual(['restock', 'initial'])
    expect((await call(`/api/admin/variants/${vid}/inventory/threshold`, { method: 'PUT', json: { lowStockThreshold: 20 } })).body?.data.isLow).toBe(true)
    expect((await call('/api/admin/inventory?lowStock=true')).body?.data.map((r: { variantId: string }) => r.variantId)).toContain(vid)
    expect((await call(`/api/admin/variants/${vid}`, { method: 'PATCH', json: { salePriceMinor: 160000 } })).status).toBe(422)
  })

  it('uploads, serves, orders and deletes product images', async () => {
    // Live product: /media only serves images of products that are live in the shop.
    const p = await call('/api/admin/products', { json: { name: `Imaged ${uniq()}`, status: 'active' } })
    const pid = p.body!.data.id
    const upload = (bytes: Uint8Array, name: string, type: string, d = deps()) => {
      const form = new FormData()
      form.set('file', new File([bytes as BlobPart], name, { type }))
      form.set('altText', 'Rawah bottle')
      return call(`/api/admin/products/${pid}/images`, { method: 'POST', body: form }, d)
    }
    const photo = new Uint8Array(readFileSync('public/products/rawah.webp'))

    const up = await upload(photo, 'IMG 0001.webp', 'image/webp')
    expect(up.status).toBe(201)
    expect(up.body?.data).toMatchObject({ source: 'object', contentType: 'image/webp', isPrimary: true, altText: 'Rawah bottle' })
    const key: string = up.body!.data.storageKey
    expect(key).toMatch(new RegExp(`^stores/${storeCode}/products/${pid}/[0-9a-f]{32}\\.webp$`))
    expect(key).not.toContain('IMG')

    const served = await api.handle(new Request(`http://localhost:3000/media/${key}`), deps())
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/webp')
    expect(served.headers.get('cache-control')).toBe('public, max-age=86400') // a day: withdrawn images stop being served
    expect(new Uint8Array(await served.arrayBuffer()).byteLength).toBe(photo.byteLength)
    expect((await api.handle(new Request('http://localhost:3000/media/../../etc/passwd'), deps())).status).toBe(404)

    expect((await upload(new TextEncoder().encode('<svg onload=alert(1)>'), 'x.svg', 'image/svg+xml')).status).toBe(422)
    expect((await upload(new Uint8Array([0x4d, 0x5a, 0x90, 0]), 'x.png', 'image/png')).status).toBe(422)
    expect((await upload(photo, 'a.webp', 'image/webp', deps(LOCAL_DEV, { objects: null }))).status).toBe(503)

    const stat = await call(`/api/admin/products/${pid}/images`, { json: { source: 'static', path: '/products/voyage.webp', altText: 'Voyage' } })
    expect(stat.status).toBe(201)
    expect((await call(`/api/admin/products/${pid}/images`, { json: { source: 'static', path: '/../../etc/passwd' } })).status).toBe(422)

    const order = await call(`/api/admin/products/${pid}/images/order`, { method: 'PUT', json: { imageIds: [stat.body!.data.id, up.body!.data.id] } })
    expect(order.status).toBe(200)
    expect((await call(`/api/admin/images/${stat.body!.data.id}/primary`, { method: 'POST' })).body?.data.isPrimary).toBe(true)
    expect((await call(`/api/admin/images/${up.body!.data.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(objects.keys()).not.toContain(key) // the stored file is removed too
  })
})
