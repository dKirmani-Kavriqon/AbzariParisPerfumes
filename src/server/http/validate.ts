import type { z } from 'zod'
import { badRequest, payloadTooLarge, unsupportedMediaType, validationFailed } from './errors'

/** Default cap on JSON request bodies. Routes that need more pass their own limit. */
export const DEFAULT_BODY_LIMIT_BYTES = 32 * 1024

/** Turns zod issues into `{ field: message }` pairs that are safe to return to the caller. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_'
    out[key] ??= issue.message
  }
  return out
}

/** Validates a value against a schema, throwing a 422 with field errors on failure. */
export function validate<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw validationFailed(fieldErrors(parsed.error))
  return parsed.data
}

/**
 * Reads a JSON body with a content-type check and a size limit, then validates it.
 * The limit is enforced while reading, so a large body is rejected without buffering it all.
 */
export async function parseJsonBody<S extends z.ZodType>(request: Request, schema: S, limitBytes = DEFAULT_BODY_LIMIT_BYTES): Promise<z.infer<S>> {
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json\b/i.test(type)) throw unsupportedMediaType('application/json')
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > limitBytes) throw payloadTooLarge(limitBytes)

  const text = await readLimited(request, limitBytes)
  let value: unknown
  try {
    value = text.length ? JSON.parse(text) : undefined
  } catch {
    throw badRequest('The request body is not valid JSON.')
  }
  return validate(schema, value)
}

/** Validates the URL query string. Repeated keys keep their last value. */
export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  return validate(schema, Object.fromEntries(new URL(request.url).searchParams))
}

async function readLimited(request: Request, limitBytes: number) {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limitBytes) {
      await reader.cancel()
      throw payloadTooLarge(limitBytes)
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(all)
}
