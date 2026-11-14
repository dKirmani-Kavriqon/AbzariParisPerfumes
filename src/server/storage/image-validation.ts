/**
 * Upload checks for product images. The file's real type is read from its first bytes
 * ("magic numbers"); the name and the browser-declared MIME type are never trusted.
 * SVG is refused because it can carry scripts. Width and height are read from the headers.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8000

export type ImageKind = { contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'; ext: 'jpg' | 'png' | 'webp' | 'avif' }

export type ImageCheck =
  | { ok: true; kind: ImageKind; width: number | null; height: number | null; bytes: number }
  | { ok: false; reason: string }

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len))

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: 'image/jpeg', ext: 'jpg' }
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { contentType: 'image/png', ext: 'png' }
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { contentType: 'image/webp', ext: 'webp' }
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(b, 8, 4))) return { contentType: 'image/avif', ext: 'avif' }
  return null
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)

/** Reads pixel dimensions from the file header, or null if they cannot be found. */
export function imageDimensions(b: Uint8Array, kind: ImageKind): { width: number; height: number } | null {
  try {
    if (kind.ext === 'png' && b.length >= 24 && ascii(b, 12, 4) === 'IHDR') return { width: u32be(b, 16), height: u32be(b, 20) }
    if (kind.ext === 'jpg') {
      let i = 2
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null
        const marker = b[i + 1]
        const len = u16be(b, i + 2)
        // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: u16be(b, i + 5), width: u16be(b, i + 7) }
        i += 2 + len
      }
      return null
    }
    if (kind.ext === 'webp' && b.length >= 30) {
      const chunk = ascii(b, 12, 4)
      if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
      if (chunk === 'VP8L') {
        const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
      }
      if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
      return null
    }
    if (kind.ext === 'avif') {
      for (let i = 0; i + 16 <= Math.min(b.length, 4096); i++) {
        if (ascii(b, i, 4) === 'ispe') return { width: u32be(b, i + 8), height: u32be(b, i + 12) }
      }
      return null
    }
  } catch {
    return null
  }
  return null
}

/** Checks an upload's size, real type and dimensions. */
export function checkImage(bytes: Uint8Array, declaredType?: string | null): ImageCheck {
  if (bytes.byteLength === 0) return { ok: false, reason: 'The file is empty.' }
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: `Images must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.` }
  if (declaredType && !/^image\/(jpeg|png|webp|avif)$/i.test(declaredType)) return { ok: false, reason: 'Only JPEG, PNG, WebP or AVIF images are accepted.' }
  const kind = sniffImage(bytes)
  if (!kind) return { ok: false, reason: 'Only JPEG, PNG, WebP or AVIF images are accepted.' }
  const dims = imageDimensions(bytes, kind)
  if (dims && (dims.width < 1 || dims.height < 1 || dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION)) {
    return { ok: false, reason: `Images must be between 1 and ${MAX_IMAGE_DIMENSION} pixels on each side.` }
  }
  return { ok: true, kind, width: dims?.width ?? null, height: dims?.height ?? null, bytes: bytes.byteLength }
}

/** sha256 of the content, hex. Used to build keys that never contain user input. */
export async function contentHash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Safe object key: stores/<store>/products/<product uuid>/<content hash>.<ext> */
export function productImageKey(storeCode: string, productId: string, hash: string, ext: string) {
  if (!/^[a-z0-9-]+$/.test(storeCode) || !/^[0-9a-f-]{36}$/.test(productId) || !/^[0-9a-f]{64}$/.test(hash)) throw new Error('unsafe key part')
  return `stores/${storeCode}/products/${productId}/${hash.slice(0, 32)}.${ext}`
}

/** Keys the /media route will serve: only ones this app could have written. */
export const SERVABLE_KEY_RE = /^stores\/[a-z0-9-]+\/products\/[0-9a-f-]{36}\/[0-9a-f]{32}\.(jpg|png|webp|avif)$/
