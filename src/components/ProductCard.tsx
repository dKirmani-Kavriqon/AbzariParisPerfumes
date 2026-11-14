'use client'

import Link from 'next/link'
import { formatINR, type Product } from '../data/products'
import { useCart } from '../state/cart'

export default function ProductCard({ p }: { p: Product }) {
  const add = useCart((s) => s.add)
  const off = p.compareAt ? Math.round((1 - p.price / p.compareAt) * 100) : 0
  return (
    <article className={`card ${p.soldOut ? 'is-soon' : ''}`}>
      <Link href={`/product/${p.slug}`} className="card-media" aria-label={p.name}>
        <img src={p.image} alt={`${p.name} by Abzari Paris`} loading="lazy" width={616} height={616} />
        {off > 0 && <span className="tag">{off}% off</span>}
        {p.soldOut && <span className="tag tag-quiet">Coming soon</span>}
      </Link>
      <div className="card-body">
        <div>
          <h3 className="card-title">
            <Link href={`/product/${p.slug}`}>{p.name}</Link>
          </h3>
          <p className="card-meta">{p.size}</p>
        </div>
        {!p.soldOut && (
          <div className="card-price">
            <span>{formatINR(p.price)}</span>
            {p.compareAt && <s>{formatINR(p.compareAt)}</s>}
          </div>
        )}
      </div>
      {!p.soldOut && (
        <button className="card-add" onClick={() => add(p.slug)} aria-label={`Add ${p.name} to bag`}>
          Add to bag
        </button>
      )}
    </article>
  )
}
