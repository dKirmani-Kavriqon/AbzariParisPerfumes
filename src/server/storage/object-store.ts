/**
 * Where uploaded files live. Business logic depends only on this interface, never on a
 * provider, so R2 can be swapped (or faked in tests) without touching catalogue code.
 */
export type StoredObject = { body: ReadableStream | ArrayBuffer; contentType: string; size: number; etag?: string }

export interface ObjectStore {
  readonly name: string
  put(key: string, body: ArrayBuffer | Uint8Array, meta: { contentType: string; metadata?: Record<string, string> }): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(key: string): Promise<void>
}

/** The parts of Cloudflare's R2 bucket binding this adapter uses. */
export type R2BucketLike = {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> }): Promise<unknown>
  get(key: string): Promise<{ body: ReadableStream; size: number; httpEtag?: string; httpMetadata?: { contentType?: string } } | null>
  delete(key: string): Promise<void>
}

/** Cloudflare R2 through a Worker binding: no access keys in the app, nothing public by default. */
export function r2Store(bucket: R2BucketLike): ObjectStore {
  return {
    name: 'r2',
    async put(key, body, meta) {
      await bucket.put(key, body, {
        httpMetadata: { contentType: meta.contentType, cacheControl: 'public, max-age=31536000, immutable' },
        customMetadata: meta.metadata,
      })
    },
    async get(key) {
      const obj = await bucket.get(key)
      if (!obj) return null
      return { body: obj.body, size: obj.size, etag: obj.httpEtag, contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream' }
    },
    delete: (key) => bucket.delete(key),
  }
}

/** In-memory store for tests. Never used by a deployed Worker. */
export function memoryStore(): ObjectStore & { keys(): string[] } {
  const data = new Map<string, { bytes: Uint8Array; contentType: string; metadata?: Record<string, string> }>()
  return {
    name: 'memory',
    keys: () => [...data.keys()],
    async put(key, body, meta) {
      data.set(key, { bytes: body instanceof Uint8Array ? body : new Uint8Array(body), contentType: meta.contentType, metadata: meta.metadata })
    },
    async get(key) {
      const hit = data.get(key)
      if (!hit) return null
      return { body: hit.bytes.slice().buffer, size: hit.bytes.byteLength, contentType: hit.contentType }
    },
    async delete(key) {
      data.delete(key)
    },
  }
}
