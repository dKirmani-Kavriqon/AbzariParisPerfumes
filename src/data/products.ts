export type Category = 'parfum' | 'oil' | 'bakhoor' | 'natural'

export type NoteTier = { tier: 'Top' | 'Heart' | 'Base'; notes: string[] }

export type Product = {
  slug: string
  name: string
  category: Category
  price: number
  compareAt?: number
  soldOut?: boolean
  /** Liquid tint used by the bottle renders until real photography is dropped in. */
  liquid: string
  /** Optional photography. When set, cards and product pages use it instead of the bottle render. */
  image?: string
  /** Larger shots for the product page */
  gallery?: string[]
  size: string
  description?: string
  notes?: NoteTier[]
}

// Catalogue mirrors abzariparis.com as of 8 Nov 2026 (21 items).
// Descriptions and notes are only filled in where the live store publishes them.
export const products: Product[] = [
  {
    slug: 'rawah',
    name: 'Rawah',
    category: 'parfum',
    price: 1500,
    compareAt: 1799,
    liquid: '#c99a2e',
    size: '50ml Eau de Parfum',
    description:
      'An oud built for evening. Precious oud wood up front, a balsamic warmth underneath and a powdery finish that stays on the collar long after you leave the room.',
    notes: [
      { tier: 'Top', notes: ['Woody', 'Balsamic', 'Powdery'] },
      { tier: 'Heart', notes: ['Musky', 'Warm Spicy', 'Tobacco'] },
      { tier: 'Base', notes: ['Oud', 'Amber', 'Metallic'] },
    ],
  },
  {
    slug: 'voyage',
    name: 'Voyage',
    category: 'parfum',
    price: 1500,
    compareAt: 1799,
    liquid: '#8a6fa8',
    size: '50ml Eau de Parfum',
    description:
      'Crisp citrus, a spiced heart and earthy woods. Made for the day you leave early and get back late.',
    notes: [{ tier: 'Top', notes: ['Frozen Apple', 'Italian Bergamot', 'Italian Lemon'] }],
  },
  { slug: 'bronze-flora', name: 'Bronze Flora', category: 'parfum', price: 1500, compareAt: 1799, liquid: '#c4691f', size: '50ml Eau de Parfum' },
  { slug: 'citrus-amour', name: 'Citrus Amour', category: 'parfum', price: 1500, compareAt: 1799, liquid: '#e9e2c8', size: '50ml Eau de Parfum' },
  { slug: 'elan-noir', name: 'Elan Noir', category: 'parfum', price: 1500, liquid: '#d8c27a', size: '50ml Eau de Parfum' },
  { slug: 'green-velvet', name: 'Green Velvet', category: 'parfum', price: 1500, liquid: '#3f8f4e', size: '50ml Eau de Parfum' },
  { slug: 'opium-throne', name: 'Opium Throne', category: 'parfum', price: 1500, compareAt: 1799, liquid: '#d9b62c', size: '50ml Eau de Parfum' },
  { slug: 'oudrelic', name: 'Oudrelic', category: 'parfum', price: 1500, liquid: '#b97c1c', size: '50ml Eau de Parfum' },
  { slug: 'tidal-temptation', name: 'Tidal Temptation', category: 'parfum', price: 1500, liquid: '#3d7fb8', size: '50ml Eau de Parfum' },
  { slug: 'wood-zest', name: 'Wood Zest', category: 'parfum', price: 1500, liquid: '#2f8f8a', size: '50ml Eau de Parfum' },

  { slug: 'amber-sultan', name: 'Amber Sultan', category: 'oil', price: 500, compareAt: 799, liquid: '#efe9dc', size: 'Perfume Oil' },
  { slug: 'arabian-spirit', name: 'Arabian Spirit', category: 'oil', price: 500, compareAt: 799, liquid: '#8fd14a', size: 'Perfume Oil' },
  { slug: 'midnight-zest', name: 'Midnight Zest', category: 'oil', price: 500, compareAt: 799, liquid: '#ece3c4', size: 'Perfume Oil' },
  { slug: 'mystic-musk', name: 'Mystic Musk', category: 'oil', price: 500, compareAt: 799, liquid: '#e4cf4a', size: 'Perfume Oil' },
  { slug: 'oud-blanc', name: 'Oud Blanc', category: 'oil', price: 500, compareAt: 799, liquid: '#efe6c9', size: 'Perfume Oil' },
  { slug: 'roma-essence', name: 'Roma Essence', category: 'oil', price: 500, compareAt: 799, liquid: '#7fb9dd', size: 'Perfume Oil' },
  { slug: 'royal-genesis', name: 'Royal Genesis', category: 'oil', price: 500, compareAt: 799, liquid: '#26318f', size: 'Perfume Oil' },
  { slug: 'sacred-woods', name: 'Sacred Woods', category: 'oil', price: 500, compareAt: 799, liquid: '#e3b23c', size: 'Perfume Oil' },
  { slug: 'velvet-musk', name: 'Velvet Musk', category: 'oil', price: 500, compareAt: 799, liquid: '#d6ead2', size: 'Perfume Oil' },

  { slug: 'bakhoor', name: 'Bakhoor', category: 'bakhoor', price: 0, soldOut: true, liquid: '#6b4a2b', size: 'Coming soon' },
  { slug: 'natural-oils', name: 'Natural Oils', category: 'natural', price: 0, soldOut: true, liquid: '#7a2f3a', size: 'Coming soon' },
]

// Every product has a photo cut from the live store at /products/<slug>.webp
const B = import.meta.env.BASE_URL
for (const p of products) p.image ??= `${B}products/${p.slug}.webp`
bySlugRaw('rawah')!.gallery = [`${B}products/rawah-hero.webp`, `${B}products/rawah-duo.webp`, `${B}products/rawah-notes.webp`]
bySlugRaw('voyage')!.gallery = [`${B}products/voyage-hero.webp`, `${B}products/voyage.webp`]

function bySlugRaw(slug: string) {
  return products.find((p) => p.slug === slug)
}

/** What each note smells like, in plain words. Shown in the Rawah story and on product pages. */
export const noteDescription: Record<string, string> = {
  Woody: 'Dry, smooth wood, like a freshly planed board of cedar.',
  Balsamic: 'Warm tree resin, sweet and a little sticky, glowing like honey.',
  Powdery: 'A soft, cosmetic finish that blurs the edges, like face powder on skin.',
  Musky: 'Clean, skin-like warmth that sits close and lasts.',
  'Warm Spicy': 'Cinnamon bark, clove and star anise, warm rather than hot.',
  Tobacco: 'Cured leaf, sweet and faintly smoky, like an opened tin.',
  Oud: 'Agarwood. Deep, smoky and a little leathery: the heart of Rawah.',
  Amber: 'Golden resin warmth, round and sweet, that holds everything together.',
  Metallic: 'A cool mineral edge that keeps the base from feeling heavy.',
}

export const noteImage = (note: string) => `${import.meta.env.BASE_URL}notes/${note.toLowerCase().replace(/\s+/g, '-')}.webp`
export const hasNoteImage = (note: string) =>
  ['woody', 'balsamic', 'powdery', 'musky', 'warm spicy', 'tobacco', 'oud', 'amber', 'metallic'].includes(note.toLowerCase())

export const categoryLabel: Record<Category, string> = {
  parfum: 'Eau de Parfum',
  oil: 'Perfume Oils',
  bakhoor: 'Bakhoor',
  natural: 'Natural Oils',
}

export const bySlug = (slug: string) => products.find((p) => p.slug === slug)

export const formatINR = (n: number) =>
  'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 })
