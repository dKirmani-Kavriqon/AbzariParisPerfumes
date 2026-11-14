import 'server-only'
import { z } from 'zod'
import { archiveCategory, createCategory, listCategories, restoreCategory, updateCategory } from '../../commerce/catalog/categories'
import { addImage, deleteImage, listImages, reorderImages, setPrimaryImage, updateImage } from '../../commerce/catalog/images'
import { adjustStock, getStock, listInventory, listMovements, setLowStockThreshold } from '../../commerce/catalog/inventory'
import { archiveProduct, createProduct, getProduct, getProductRow, listProducts, restoreProduct, setProductCategories, updateProduct } from '../../commerce/catalog/products'
import { resolveStore, type StoreContext } from '../../commerce/catalog/store'
import {
  createCategorySchema,
  createProductSchema,
  createVariantSchema,
  idSchema,
  inventoryListQuerySchema,
  productListQuerySchema,
  reorderImagesSchema,
  setCategoriesSchema,
  skuSchema,
  stockAdjustmentSchema,
  thresholdSchema,
  updateCategorySchema,
  updateImageSchema,
  updateProductSchema,
  updateVariantSchema,
} from '../../commerce/catalog/validation'
import { archiveVariant, createVariant, getVariant, isSkuAvailable, listVariants, updateVariant } from '../../commerce/catalog/variants'
import { assertSameOriginWrite, requireAdmin, type AdminIdentity } from '../auth/admin'
import type { Db } from '../db/types'
import { AppError, badRequest, forbidden, notFound, payloadTooLarge, serviceUnavailable, validationFailed } from '../http/errors'
import { ok } from '../http/response'
import type { RouteContext } from '../http/route'
import { parseJsonBody, parseQuery, validate } from '../http/validate'
import { timingSafeEqual } from '../security'
import { pingDatabase } from '../db/client'
import { checkImage, contentHash, MAX_IMAGE_BYTES, productImageKey, SERVABLE_KEY_RE } from '../storage/image-validation'
import type { ApiDeps } from './deps'
import { createRouter } from './router'

type Ctx = RouteContext<Record<string, string>> & { deps: ApiDeps }
type AdminCtx = Ctx & { db: Db; store: StoreContext; admin: AdminIdentity; actor: string }

/** Wraps an admin handler: access check, cross-site check, then the store-scoped context. */
const admin =
  (fn: (req: Request, ctx: AdminCtx) => Promise<Response>) =>
  async (req: Request, ctx: Ctx): Promise<Response> => {
    const identity = await requireAdmin(req, ctx.deps.env(), ctx.deps.fetch)
    assertSameOriginWrite(req)
    const db = ctx.deps.db()
    const store = await resolveStore(db, ctx.deps.storeCode)
    return fn(req, { ...ctx, db, store, admin: identity, actor: identity.email ?? 'local-developer' })
  }

const param = (ctx: Ctx, key: string) => validate(idSchema, ctx.params[key])
const okJson = (data: unknown, ctx: Ctx, status = 200) => ok(data, ctx.requestId, { status })

export function buildApi() {
  const api = createRouter<ApiDeps>()

  // ---------- public ----------

  /** Liveness and configuration; the database check needs the health token (see docs/DEPLOYMENT.md). */
  api.get('/api/health', async (req, ctx) => {
    const env = ctx.deps.env()
    const { checks } = parseQuery(req, z.object({ checks: z.enum(['db']).optional() }))
    const body: Record<string, unknown> = { status: 'ok', store: ctx.deps.storeCode, environment: env.APP_ENV, database: env.DATABASE_URL ? 'configured' : 'not configured' }
    if (checks === 'db') {
      const supplied = req.headers.get('x-health-token') ?? ''
      if (!env.HEALTH_CHECK_TOKEN || !timingSafeEqual(supplied, env.HEALTH_CHECK_TOKEN)) throw forbidden('The database check needs a valid health token.')
      const { latencyMs } = await pingDatabase(ctx.deps.db() as never)
      body.database = 'reachable'
      body.databaseLatencyMs = latencyMs
    }
    return ok(body, ctx.requestId)
  })

  /** Uploaded product images. Only keys this app writes are served; content type comes from upload time. */
  api.get('/media/*key', async (_req, ctx) => {
    const key = ctx.params.key
    if (!SERVABLE_KEY_RE.test(key)) throw notFound('Not found.')
    const store = ctx.deps.objectStore()
    if (!store) throw notFound('Not found.')
    const obj = await store.get(key)
    if (!obj) throw notFound('Not found.')
    return new Response(obj.body, {
      headers: {
        'content-type': obj.contentType,
        'content-length': String(obj.size),
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        ...(obj.etag ? { etag: obj.etag } : {}),
      },
    })
  })

  // ---------- admin: session ----------

  api.get(
    '/api/admin/session',
    admin(async (_req, ctx) => okJson({ email: ctx.admin.email, method: ctx.admin.method, store: { code: ctx.store.code, name: ctx.deps.storeName, currency: ctx.store.defaultCurrency } }, ctx)),
  )

  // ---------- admin: products ----------

  api.get(
    '/api/admin/products',
    admin(async (req, ctx) => okJson(await listProducts(ctx.db, ctx.store.id, parseQuery(req, productListQuerySchema)), ctx)),
  )
  api.post(
    '/api/admin/products',
    admin(async (req, ctx) => okJson(await createProduct(ctx.db, ctx.store, await parseJsonBody(req, createProductSchema, 128 * 1024), ctx.actor), ctx, 201)),
  )
  api.get(
    '/api/admin/products/:id',
    admin(async (_req, ctx) => okJson(await getProduct(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.patch(
    '/api/admin/products/:id',
    admin(async (req, ctx) => okJson(await updateProduct(ctx.db, ctx.store.id, param(ctx, 'id'), await parseJsonBody(req, updateProductSchema, 64 * 1024)), ctx)),
  )
  api.post(
    '/api/admin/products/:id/archive',
    admin(async (_req, ctx) => okJson(await archiveProduct(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.post(
    '/api/admin/products/:id/restore',
    admin(async (_req, ctx) => okJson(await restoreProduct(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.put(
    '/api/admin/products/:id/categories',
    admin(async (req, ctx) => okJson(await setProductCategories(ctx.db, ctx.store.id, param(ctx, 'id'), (await parseJsonBody(req, setCategoriesSchema)).categoryIds), ctx)),
  )

  // ---------- admin: variants ----------

  api.get(
    '/api/admin/products/:id/variants',
    admin(async (_req, ctx) => okJson(await listVariants(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.post(
    '/api/admin/products/:id/variants',
    admin(async (req, ctx) => okJson(await createVariant(ctx.db, ctx.store, param(ctx, 'id'), await parseJsonBody(req, createVariantSchema), ctx.actor), ctx, 201)),
  )
  api.get(
    '/api/admin/variants/:id',
    admin(async (_req, ctx) => okJson(await getVariant(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.patch(
    '/api/admin/variants/:id',
    admin(async (req, ctx) => okJson(await updateVariant(ctx.db, ctx.store.id, param(ctx, 'id'), await parseJsonBody(req, updateVariantSchema)), ctx)),
  )
  api.post(
    '/api/admin/variants/:id/archive',
    admin(async (_req, ctx) => okJson(await archiveVariant(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.get(
    '/api/admin/skus/availability',
    admin(async (req, ctx) => {
      const q = parseQuery(req, z.object({ sku: skuSchema, excludeVariantId: idSchema.optional() }))
      return okJson({ sku: q.sku, available: await isSkuAvailable(ctx.db, ctx.store.id, q.sku, q.excludeVariantId) }, ctx)
    }),
  )

  // ---------- admin: inventory ----------

  api.get(
    '/api/admin/inventory',
    admin(async (req, ctx) => okJson(await listInventory(ctx.db, ctx.store.id, parseQuery(req, inventoryListQuerySchema)), ctx)),
  )
  api.get(
    '/api/admin/variants/:id/inventory',
    admin(async (req, ctx) => {
      const id = param(ctx, 'id')
      const { limit } = parseQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }))
      const [stock, movements] = await Promise.all([getStock(ctx.db, ctx.store.id, id), listMovements(ctx.db, ctx.store.id, id, limit)])
      return okJson({ stock, movements }, ctx)
    }),
  )
  api.post(
    '/api/admin/variants/:id/inventory/adjustments',
    admin(async (req, ctx) => okJson(await adjustStock(ctx.db, ctx.store.id, param(ctx, 'id'), await parseJsonBody(req, stockAdjustmentSchema), ctx.actor), ctx, 201)),
  )
  api.put(
    '/api/admin/variants/:id/inventory/threshold',
    admin(async (req, ctx) => okJson(await setLowStockThreshold(ctx.db, ctx.store.id, param(ctx, 'id'), (await parseJsonBody(req, thresholdSchema)).lowStockThreshold), ctx)),
  )

  // ---------- admin: images ----------

  api.get(
    '/api/admin/products/:id/images',
    admin(async (_req, ctx) => okJson(await listImages(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.post(
    '/api/admin/products/:id/images',
    admin(async (req, ctx) => {
      const productId = param(ctx, 'id')
      const type = req.headers.get('content-type') ?? ''
      if (type.startsWith('application/json')) {
        // Register an image that already ships with the site (public/products, public/notes).
        const body = await parseJsonBody(
          req,
          z.object({
            source: z.literal('static'),
            path: z.string().regex(/^\/(products|notes)\/[a-z0-9][a-z0-9-]*\.(webp|png|jpg|jpeg|avif)$/, 'Must be a file under /products or /notes.'),
            altText: z.string().trim().max(250).default(''),
            variantId: idSchema.nullish(),
          }),
        )
        return okJson(await addImage(ctx.db, ctx.store.id, productId, { source: 'static', storageKey: body.path, altText: body.altText, variantId: body.variantId ?? null }), ctx, 201)
      }
      return okJson(await uploadImage(req, ctx, productId), ctx, 201)
    }),
  )
  api.put(
    '/api/admin/products/:id/images/order',
    admin(async (req, ctx) => okJson(await reorderImages(ctx.db, ctx.store.id, param(ctx, 'id'), (await parseJsonBody(req, reorderImagesSchema)).imageIds), ctx)),
  )
  api.patch(
    '/api/admin/images/:id',
    admin(async (req, ctx) => okJson(await updateImage(ctx.db, ctx.store.id, param(ctx, 'id'), await parseJsonBody(req, updateImageSchema)), ctx)),
  )
  api.post(
    '/api/admin/images/:id/primary',
    admin(async (_req, ctx) => okJson(await setPrimaryImage(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.delete(
    '/api/admin/images/:id',
    admin(async (_req, ctx) => {
      const image = await deleteImage(ctx.db, ctx.store.id, param(ctx, 'id'))
      if (image.source === 'object') {
        const store = ctx.deps.objectStore()
        // The database row is gone first, so the site never points at a missing file. A leftover
        // file (bucket unavailable) is harmless and logged for cleanup.
        try {
          if (!store) throw new Error('no object store bound')
          await store.delete(image.storageKey)
        } catch (error) {
          ctx.log.warn('image file not deleted', { key: image.storageKey, error })
        }
      }
      return okJson({ deleted: image.id }, ctx)
    }),
  )

  // ---------- admin: categories ----------

  api.get(
    '/api/admin/categories',
    admin(async (req, ctx) => {
      const { includeArchived } = parseQuery(req, z.object({ includeArchived: z.enum(['true', 'false']).optional().transform((v) => v === 'true') }))
      return okJson(await listCategories(ctx.db, ctx.store.id, { includeArchived }), ctx)
    }),
  )
  api.post(
    '/api/admin/categories',
    admin(async (req, ctx) => okJson(await createCategory(ctx.db, ctx.store.id, await parseJsonBody(req, createCategorySchema)), ctx, 201)),
  )
  api.patch(
    '/api/admin/categories/:id',
    admin(async (req, ctx) => okJson(await updateCategory(ctx.db, ctx.store.id, param(ctx, 'id'), await parseJsonBody(req, updateCategorySchema)), ctx)),
  )
  api.post(
    '/api/admin/categories/:id/archive',
    admin(async (_req, ctx) => okJson(await archiveCategory(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )
  api.post(
    '/api/admin/categories/:id/restore',
    admin(async (_req, ctx) => okJson(await restoreCategory(ctx.db, ctx.store.id, param(ctx, 'id')), ctx)),
  )

  return api
}

/**
 * Multipart image upload: checks the real file type and size, stores it under a key built from
 * the content hash (never the file name), then records it. If recording fails, the file is removed.
 */
async function uploadImage(req: Request, ctx: AdminCtx, productId: string) {
  const objects = ctx.deps.objectStore()
  if (!objects) throw serviceUnavailable('Image uploads are not set up for this deployment (no R2 bucket is bound).')
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) throw payloadTooLarge(MAX_IMAGE_BYTES)
  if (!(req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) throw badRequest('Send the image as multipart/form-data with a "file" field.')

  const product = await getProductRow(ctx.db, ctx.store.id, productId)
  if (product.archivedAt) throw new AppError(409, 'conflict', 'Restore the product before editing it.')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw badRequest('Could not read the upload.')
  }
  const file = form.get('file')
  if (!file || typeof file === 'string') throw validationFailed({ file: 'Choose an image to upload.' })
  if (file.size > MAX_IMAGE_BYTES) throw payloadTooLarge(MAX_IMAGE_BYTES)
  const meta = z
    .object({ altText: z.string().trim().max(250).default(''), variantId: idSchema.optional().or(z.literal('').transform(() => undefined)) })
    .safeParse({ altText: form.get('altText') ?? '', variantId: form.get('variantId') ?? undefined })
  if (!meta.success) throw validationFailed({ altText: 'Alt text must be 250 characters or fewer.' })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkImage(bytes, file.type || null)
  if (!check.ok) throw validationFailed({ file: check.reason })

  const key = productImageKey(ctx.store.code, productId, await contentHash(bytes), check.kind.ext)
  await objects.put(key, bytes, { contentType: check.kind.contentType, metadata: { productId, uploadedBy: ctx.actor } })
  try {
    return await addImage(ctx.db, ctx.store.id, productId, {
      source: 'object',
      storageKey: key,
      contentType: check.kind.contentType,
      byteSize: check.bytes,
      width: check.width,
      height: check.height,
      altText: meta.data.altText,
      variantId: meta.data.variantId ?? null,
    })
  } catch (error) {
    // Same file uploaded twice for this product: keep the existing object, report the conflict.
    if (!(error instanceof AppError && error.status === 409)) await objects.delete(key).catch(() => undefined)
    throw error
  }
}

let cached: ReturnType<typeof buildApi> | undefined
export function api() {
  return (cached ??= buildApi())
}
