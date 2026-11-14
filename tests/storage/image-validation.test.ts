import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkImage, contentHash, MAX_IMAGE_BYTES, productImageKey, SERVABLE_KEY_RE, sniffImage } from '../../src/server/storage/image-validation'
import { memoryStore } from '../../src/server/storage/object-store'

const file = (p: string) => new Uint8Array(readFileSync(p))
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))

function png(w: number, h: number) {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  return bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be(13), 'IHDR', be(w), be(h), [8, 6, 0, 0, 0])
}

describe('image upload validation', () => {
  it('accepts the real product photos and reads their dimensions', () => {
    const webp = checkImage(file('public/products/rawah.webp'), 'image/webp')
    expect(webp).toMatchObject({ ok: true, kind: { contentType: 'image/webp', ext: 'webp' } })
    if (webp.ok) expect(webp.width! > 0 && webp.height! > 0).toBe(true)
    expect(checkImage(file('public/crest.png'))).toMatchObject({ ok: true, kind: { ext: 'png' } })
  })

  it('reads dimensions from PNG, JPEG, WebP (VP8X) and AVIF headers', () => {
    expect(checkImage(png(640, 480))).toMatchObject({ ok: true, width: 640, height: 480 })
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0], [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
    expect(checkImage(jpeg)).toMatchObject({ ok: true, kind: { ext: 'jpg' }, width: 640, height: 480 })
    const webp = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0, 0, 0, 0, 0], [0x7f, 0x02, 0x00], [0xdf, 0x01, 0x00])
    expect(checkImage(webp)).toMatchObject({ ok: true, kind: { ext: 'webp' }, width: 640, height: 480 })
    const avif = bytes([0, 0, 0, 0x18], 'ftypavif', [0, 0, 0, 0], 'mif1', [0, 0, 0, 0x14], 'ispe', [0, 0, 0, 0], [0, 0, 2, 0x80], [0, 0, 1, 0xe0])
    expect(checkImage(avif)).toMatchObject({ ok: true, kind: { ext: 'avif' }, width: 640, height: 480 })
  })

  it('refuses executables, scripts, SVG, HTML and other formats whatever they claim to be', () => {
    expect(checkImage(bytes('MZ', [0x90, 0, 3, 0, 0, 0]), 'image/png').ok).toBe(false) // Windows executable labelled as PNG
    expect(checkImage(bytes([0x7f], 'ELF', [2, 1, 1, 0]), 'image/jpeg').ok).toBe(false)
    expect(checkImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml').ok).toBe(false)
    expect(checkImage(bytes('<!doctype html><script>alert(1)</script>'), 'image/png').ok).toBe(false)
    expect(checkImage(bytes('GIF89a', [1, 0, 1, 0]), 'image/gif').ok).toBe(false)
    expect(checkImage(png(10, 10), 'application/x-msdownload').ok).toBe(false) // declared type is not an image
    expect(checkImage(new Uint8Array(0)).ok).toBe(false)
  })

  it('enforces size and dimension limits', () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    big.set(png(10, 10))
    expect(checkImage(big)).toMatchObject({ ok: false })
    expect(checkImage(png(9000, 100))).toMatchObject({ ok: false })
    expect(checkImage(png(0, 100))).toMatchObject({ ok: false })
  })

  it('builds keys only from safe parts, and the media route only serves such keys', async () => {
    const hash = await contentHash(png(1, 1))
    const key = productImageKey('abzari-paris', crypto.randomUUID(), hash, 'png')
    expect(key).toMatch(SERVABLE_KEY_RE)
    expect(() => productImageKey('../etc', crypto.randomUUID(), hash, 'png')).toThrow()
    expect(() => productImageKey('abzari-paris', '../../x', hash, 'png')).toThrow()
    for (const bad of ['../secret', 'stores/a/products/x/y.png', '/etc/passwd', 'stores/abzari-paris/products/../../x.png']) expect(bad).not.toMatch(SERVABLE_KEY_RE)
    expect(sniffImage(png(1, 1))?.ext).toBe('png')
  })

  it('stores, reads and deletes through the storage interface', async () => {
    const store = memoryStore()
    await store.put('k', png(2, 2), { contentType: 'image/png' })
    expect((await store.get('k'))?.contentType).toBe('image/png')
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })
})
