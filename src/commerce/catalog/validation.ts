import { z } from 'zod'
import { isValidCurrency, MAX_MINOR_AMOUNT } from './money'
import { SLUG_MAX, SLUG_RE } from './slug'

/*
 * Input rules for the catalogue. Used by the API (authoritative) and by the admin forms
 * (for early feedback). The database repeats the critical rules as constraints.
 */

const trimmed = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters.`)
const optionalText = (max: number) =>
  trimmed(max)
    .nullish()
    .transform((v) => (v ? v : null))

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Required.')
  .max(SLUG_MAX, `Must be at most ${SLUG_MAX} characters.`)
  .regex(SLUG_RE, 'Use lowercase letters, numbers and single hyphens, e.g. "elan-noir".')

export const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
export const skuSchema = z
  .string()
  .trim()
  .regex(SKU_RE, 'Use 1–64 letters, numbers, dots, dashes or underscores, starting with a letter or number.')

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidCurrency, 'Not a valid ISO 4217 currency code.')

export const idSchema = z.uuid('Not a valid id.')

const amount = z
  .number({ error: 'Must be a whole number of minor units (e.g. paise).' })
  .int('Must be a whole number of minor units (e.g. paise).')
  .min(0, 'Cannot be negative.')
  .max(MAX_MINOR_AMOUNT, 'Too large.')

const quantity = z.number().int('Must be a whole number.').min(0, 'Cannot be negative.').max(1_000_000, 'Too large.')

// ---------- products ----------

/** Product-page details, e.g. fragrance notes: up to 5 tiers of up to 10 notes. */
export const productDetailsSchema = z.object({
  notes: z
    .array(z.object({ tier: trimmed(20).min(1), notes: z.array(trimmed(40).min(1)).min(1).max(10) }))
    .max(5)
    .optional(),
})

export const productStatusInput = z.enum(['draft', 'active'])

const productFields = {
  name: trimmed(200).min(1, 'Required.'),
  slug: slugSchema.optional(),
  shortDescription: optionalText(500),
  fullDescription: optionalText(10_000),
  brand: optionalText(100),
  productType: trimmed(60).min(1).default('standard'),
  status: productStatusInput.default('draft'),
  featured: z.boolean().default(false),
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
  details: productDetailsSchema.default({}),
}

// ---------- variants ----------

const optionsSchema = z
  .record(trimmed(30).min(1), trimmed(60).min(1))
  .refine((o) => Object.keys(o).length <= 5, 'At most 5 options.')

const variantFields = {
  sku: skuSchema,
  barcode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{4,64}$/, 'Use 4–64 letters, numbers or dashes.')
    .nullish()
    .transform((v) => v || null),
  title: trimmed(80).default(''),
  options: optionsSchema.default({}),
  priceMinor: amount,
  salePriceMinor: amount.nullish().transform((v) => v ?? null),
  currency: currencySchema.optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).nullish().transform((v) => v ?? null),
  lengthMm: z.number().int().min(1).max(100_000).nullish().transform((v) => v ?? null),
  widthMm: z.number().int().min(1).max(100_000).nullish().transform((v) => v ?? null),
  heightMm: z.number().int().min(1).max(100_000).nullish().transform((v) => v ?? null),
  status: z.enum(['active', 'inactive']).default('active'),
}

const salePriceRule = (v: { priceMinor?: number; salePriceMinor?: number | null }) =>
  v.salePriceMinor == null || v.priceMinor == null || v.salePriceMinor < v.priceMinor

export const createVariantSchema = z
  .object({
    ...variantFields,
    initialStock: quantity.default(0),
    lowStockThreshold: quantity.default(0),
  })
  .refine(salePriceRule, { path: ['salePriceMinor'], message: 'The sale price must be lower than the regular price.' })

export const updateVariantSchema = z
  .object({
    sku: variantFields.sku,
    barcode: variantFields.barcode,
    title: trimmed(80),
    options: optionsSchema,
    priceMinor: amount,
    salePriceMinor: variantFields.salePriceMinor,
    weightGrams: variantFields.weightGrams,
    lengthMm: variantFields.lengthMm,
    widthMm: variantFields.widthMm,
    heightMm: variantFields.heightMm,
    status: variantFields.status,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.')
// (Sale vs regular price is checked in the service against the stored values, since either may change alone.)

export const createProductSchema = z.object({
  ...productFields,
  categoryIds: z.array(idSchema).max(20).default([]),
  variants: z.array(createVariantSchema).max(50).default([]),
})

export const updateProductSchema = z
  .object({
    name: productFields.name,
    slug: slugSchema,
    shortDescription: productFields.shortDescription,
    fullDescription: productFields.fullDescription,
    brand: productFields.brand,
    productType: trimmed(60).min(1),
    status: productStatusInput,
    featured: z.boolean(),
    seoTitle: productFields.seoTitle,
    seoDescription: productFields.seoDescription,
    details: productDetailsSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.')

export const productListQuerySchema = z.object({
  q: trimmed(100).optional(),
  status: z.enum(['draft', 'active', 'archived', 'current', 'all']).default('current'),
  categoryId: idSchema.optional(),
  featured: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

export const setCategoriesSchema = z.object({
  categoryIds: z
    .array(idSchema)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Each category may appear only once.'),
})

// ---------- categories ----------

/** A static site path ("/notes/oud.webp") or an object-store key. */
export const imageRefSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/[A-Za-z0-9._\-/]+|[a-z0-9][a-z0-9._\-/]*)$/, 'Not a valid image reference.')
  .refine((v) => !v.includes('..'), 'Not a valid image reference.')

export const createCategorySchema = z.object({
  name: trimmed(120).min(1, 'Required.'),
  slug: slugSchema.optional(),
  description: optionalText(2000),
  parentId: idSchema.nullish().transform((v) => v ?? null),
  imageRef: imageRefSchema.nullish().transform((v) => v ?? null),
  status: z.enum(['active', 'hidden']).default('active'),
  position: z.number().int().min(0).max(10_000).default(0),
})

export const updateCategorySchema = z
  .object({
    name: trimmed(120).min(1),
    slug: slugSchema,
    description: optionalText(2000),
    parentId: idSchema.nullable(),
    imageRef: imageRefSchema.nullable(),
    status: z.enum(['active', 'hidden']),
    position: z.number().int().min(0).max(10_000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.')

// ---------- inventory ----------

export const adjustmentTypes = ['restock', 'return', 'damage', 'correction'] as const

export const stockAdjustmentSchema = z
  .object({
    type: z.enum(adjustmentTypes),
    quantityChange: z.number().int('Must be a whole number.').refine((n) => n !== 0, 'Cannot be zero.').refine((n) => Math.abs(n) <= 1_000_000, 'Too large.'),
    reason: optionalText(300),
    reference: optionalText(120),
  })
  .refine((a) => (a.type === 'restock' || a.type === 'return' ? a.quantityChange > 0 : true), {
    path: ['quantityChange'],
    message: 'Restocks and returns add stock, so the change must be positive.',
  })
  .refine((a) => (a.type === 'damage' ? a.quantityChange < 0 : true), { path: ['quantityChange'], message: 'Damage removes stock, so the change must be negative.' })
  .refine((a) => (a.type === 'correction' || a.type === 'damage' ? !!a.reason : true), { path: ['reason'], message: 'Say why the stock is being corrected.' })

export const thresholdSchema = z.object({ lowStockThreshold: quantity })

export const inventoryListQuerySchema = z.object({
  q: trimmed(100).optional(),
  lowStock: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

// ---------- images ----------

export const updateImageSchema = z
  .object({
    altText: trimmed(250),
    variantId: idSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.')

export const reorderImagesSchema = z.object({
  imageIds: z
    .array(idSchema)
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Each image may appear only once.'),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type CreateVariantInput = z.infer<typeof createVariantSchema>
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>
export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>
export type ProductListQuery = z.infer<typeof productListQuerySchema>
