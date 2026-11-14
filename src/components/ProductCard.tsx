'use client'

import Link from 'next/link'
import { formatShopPrice } from '../commerce/catalog/money'
import { buyable, displayPrice, isPurchasable, leadVariant, type PublicProduct } from '../commerce/catalog/public'
import AddToBagButton from './AddToBagButton'

export default function ProductCard({ p }: { p: PublicProduct }) {
  const variant = leadVariant(p)
  const soon = p.availability === 'coming_soon'
  const soldOut = p.availability === 'out_of_stock'
  const price = variant ? displayPrice(variant) : null
  const off = price?.compareAt ? Math.round((1 - price.price / price.compareAt) * 100) : 0
  const image = p.images[0]
  return (
    <article className={`card ${soon ? 'is-soon' : ''}`}>
      <Link href={`/product/${p.slug}`} className="card-media" aria-label={p.name}>
        {image && <img src={image.url} alt={image.alt} loading="lazy" width={616} height={616} />}
        {off > 0 && !soldOut && <span className="tag">{off}% off</span>}
        {soon && <span className="tag tag-quiet">Coming soon</span>}
        {soldOut && <span className="tag tag-quiet">Sold out</span>}
      </Link>
      <div className="card-body">
        <div>
          <h3 className="card-title">
            <Link href={`/product/${p.slug}`}>{p.name}</Link>
          </h3>
          <p className="card-meta">{variant?.title || p.shortDescription}</p>
        </div>
        {price && variant && (
          <div className="card-price">
            <span>{formatShopPrice(price.price, variant.currency)}</span>
            {price.compareAt && <s>{formatShopPrice(price.compareAt, variant.currency)}</s>}
          </div>
        )}
      </div>
      {isPurchasable(p) && p.variants.length > 1 && (
        <Link href={`/product/${p.slug}`} className="card-add" aria-label={`Choose a size of ${p.name}`}>
          Choose size
        </Link>
      )}
      {isPurchasable(p) && p.variants.length === 1 && buyable(p) && (
        <AddToBagButton className="card-add" sku={buyable(p)!.sku} label={`Add ${p.name} to bag`}>
          Add to bag
        </AddToBagButton>
      )}
    </article>
  )
}
