/*
 * The public catalogue: what shoppers may see. Built on the server from the database
 * (public-build.ts), published as one JSON document, and read by the storefront and the public
 * API. Contains only public fields: no database ids, no exact stock counts, no draft or
 * archived products. Safe for browser and server code.
 */

export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock'
/** A product's overall state in the shop. `coming_soon` = live but nothing to buy yet (no variant with a price). */
export type ProductAvailability = Availability | 'coming_soon'

export type PublicImage = { url: string; alt: string; width: number | null; height: number | null }

export type PublicVariant = {
  sku: string
  title: string
  options: Record<string, string>
  priceMinor: number
  salePriceMinor: number | null
  currency: string
  availability: Availability
}

export type PublicProduct = {
  slug: string
  name: string
  shortDescription: string | null
  description: string | null
  brand: string | null
  productType: string
  featured: boolean
  /** Category slugs, in the product's own order. */
  categories: string[]
  notes: { tier: string; notes: string[] }[]
  images: PublicImage[]
  variants: PublicVariant[]
  availability: ProductAvailability
  seoTitle: string | null
  seoDescription: string | null
}

export type PublicCategory = { slug: string; name: string; description: string | null; parent: string | null; position: number; imageUrl: string | null }

export type PublicCatalog = {
  schema: 1
  store: string
  currency: string
  /** Database time the catalogue was read. Newer always wins when publishing. */
  generatedAt: string
  categories: PublicCategory[]
  products: PublicProduct[]
}

export const emptyCatalog = (store: string, currency: string): PublicCatalog => ({ schema: 1, store, currency, generatedAt: new Date(0).toISOString(), categories: [], products: [] })

// ---------- reading helpers (used by the storefront and the public API) ----------

/** The variant a product card shows: the first one in stock, else the first one. */
export function leadVariant(p: PublicProduct): PublicVariant | undefined {
  return p.variants.find((v) => v.availability !== 'out_of_stock') ?? p.variants[0]
}

/** What a shopper pays now, and the struck-through price when on sale. */
export function displayPrice(v: PublicVariant) {
  return v.salePriceMinor != null ? { price: v.salePriceMinor, compareAt: v.priceMinor } : { price: v.priceMinor, compareAt: null }
}

/** Lowest current price across variants (for sorting), or null for coming-soon products. */
export function fromPrice(p: PublicProduct) {
  if (!p.variants.length) return null
  return Math.min(...p.variants.map((v) => displayPrice(v).price))
}

export const isPurchasable = (p: PublicProduct) => p.availability === 'in_stock' || p.availability === 'low_stock'

/** The variant a one-click "Add to bag" adds: the first one that is in stock. */
export const buyable = (p: PublicProduct) => p.variants.find((v) => v.availability === 'in_stock' || v.availability === 'low_stock')

/** A category and all of its descendants. */
export function categoryWithDescendants(categories: PublicCategory[], slug: string) {
  const out = new Set<string>([slug])
  let grew = true
  while (grew) {
    grew = false
    for (const c of categories) {
      if (c.parent && out.has(c.parent) && !out.has(c.slug)) {
        out.add(c.slug)
        grew = true
      }
    }
  }
  return out
}

export type CatalogQuery = {
  q?: string
  /** A category slug (includes its subcategories), or "coming-soon". */
  category?: string
  availability?: 'available' | 'all'
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'name'
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Search, filter and sort products. Pure: the same logic runs in the browser and in the API. */
export function queryProducts(catalog: PublicCatalog, query: CatalogQuery): PublicProduct[] {
  let list = catalog.products
  if (query.category === 'coming-soon') list = list.filter((p) => p.availability === 'coming_soon')
  else if (query.category) {
    const cats = categoryWithDescendants(catalog.categories, query.category)
    list = list.filter((p) => p.availability !== 'coming_soon' && p.categories.some((c) => cats.has(c)))
  }
  if (query.availability === 'available') list = list.filter(isPurchasable)
  if (query.q) {
    const terms = norm(query.q).split(/\s+/).filter(Boolean)
    list = list.filter((p) => {
      const hay = norm([p.name, p.brand ?? '', p.shortDescription ?? '', p.productType, ...p.notes.flatMap((t) => t.notes), ...p.variants.map((v) => `${v.sku} ${v.title}`)].join(' '))
      return terms.every((t) => hay.includes(t))
    })
  }
  const byName = (a: PublicProduct, b: PublicProduct) => a.name.localeCompare(b.name)
  const sorted = [...list]
  switch (query.sort ?? 'featured') {
    case 'price-asc':
      return sorted.sort((a, b) => (fromPrice(a) ?? Infinity) - (fromPrice(b) ?? Infinity) || byName(a, b))
    case 'price-desc':
      return sorted.sort((a, b) => (fromPrice(b) ?? -Infinity) - (fromPrice(a) ?? -Infinity) || byName(a, b))
    case 'name':
      return sorted.sort(byName)
    default:
      // Catalogue order, with coming-soon products last (as the original shop did).
      return sorted.sort((a, b) => Number(a.availability === 'coming_soon') - Number(b.availability === 'coming_soon'))
  }
}

export const productBySlug = (catalog: PublicCatalog, slug: string) => catalog.products.find((p) => p.slug === slug)
