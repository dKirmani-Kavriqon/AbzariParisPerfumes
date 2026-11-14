/**
 * Store configuration: everything that changes from one client deployment to the next.
 *
 * Each deployment serves exactly one store. To set up another client, copy this file's
 * shape into that client's config and point the build at it (see docs/CLIENT_SETUP.md).
 * Nothing in here may be secret: this module is bundled into browser code. Secrets live in
 * Worker secrets and are read through `src/server/env.ts`.
 */
export type StoreConfig = {
  /** Stable machine id, used in logs and resource names. Lowercase, no spaces. */
  id: string
  name: string
  /** One line used for the default page description and search results. */
  description: string
  /** Where the store will live once launched. Used for canonical URLs, not for routing. */
  siteUrl: string
  locale: string
  /** ISO 4217 code of the store's default currency (prices are stored per variant with their own code). */
  currency: string
  branding: {
    themeColor: string
    favicon: string
  }
  contact: {
    email: string
    phoneDisplay: string
    /** E.164, used for tel: links */
    phoneE164: string
    addressLines: string[]
    supportHours: string
  }
  business: {
    legalName: string
    /** Text shown in the cart and product pages until shipping rules move to the database. */
    shippingNote: string
    returnsWindowDays: number
  }
  credit: string
  /** How the catalogue is presented. Category slugs refer to categories in the database. */
  catalogue: {
    /** The product told by the 3D story on the home page (left out of the grids below it). */
    heroProductSlug: string
    /** Product grids on the home page, in order. */
    homeSections: { categorySlug: string; eyebrow: string; title: string; lede: string }[]
    /** Old shop links (?c=parfum) still work: alias → category slug. */
    categoryAliases: Record<string, string>
  }
}

export const store: StoreConfig = {
  id: 'abzari-paris',
  name: 'Abzari Paris',
  description: 'Abzari Paris. Eaux de parfum and perfume oils from New Delhi. Meet Rawah, an oud for evening.',
  siteUrl: 'https://abzariparis.com',
  locale: 'en-IN',
  currency: 'INR',
  branding: {
    themeColor: '#0b0907',
    favicon: '/crest.png',
  },
  contact: {
    email: 'info@abzariparis.com',
    phoneDisplay: '+91 87969 24324',
    phoneE164: '+918796924324',
    addressLines: ['259A/3 Nayyar Manzil, Noor Nagar, Jamia Nagar, New Delhi 110025'],
    supportHours: 'Support every day, around the clock',
  },
  business: {
    legalName: 'Abzari Paris',
    shippingNote: 'Free shipping across India. Taxes included.',
    returnsWindowDays: 7,
  },
  credit: 'Site by Kavriqon Technologies',
  catalogue: {
    heroProductSlug: 'rawah',
    homeSections: [
      {
        categorySlug: 'eau-de-parfum',
        eyebrow: 'Eau de Parfum',
        title: 'Ten bottles, ten occasions.',
        lede: 'Each one made for a moment: an office morning, a wedding night, a long drive out of the city.',
      },
      {
        categorySlug: 'perfume-oils',
        eyebrow: 'Perfume Oils',
        title: 'Concentrated, alcohol free, close to the skin.',
        lede: 'Roll-on oils in the attar tradition. Apply to the wrist and the pulse points.',
      },
    ],
    categoryAliases: { parfum: 'eau-de-parfum', oil: 'perfume-oils', soon: 'coming-soon' },
  },
}
