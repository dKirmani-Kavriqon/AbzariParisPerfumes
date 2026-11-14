'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProductCard from '../components/ProductCard'
import NotFound from './NotFound'
import { store } from '../config/store'
import { formatShopPrice } from '../commerce/catalog/money'
import { displayPrice, leadVariant } from '../commerce/catalog/public'
import { hasNoteImage, noteDescription, noteImage } from '../data/notes'
import { useCart } from '../state/cart'
import { useCatalog } from '../state/catalog'

export default function ProductPage({ slug }: { slug: string }) {
  const { catalog, bySlug } = useCatalog()
  const p = bySlug(slug)
  const add = useCart((s) => s.add)
  const router = useRouter()
  const [qty, setQty] = useState(1)
  const [shot, setShot] = useState(0)
  const [sku, setSku] = useState<string | null>(null)

  if (!p) return <NotFound />
  const shots = p.images
  const variant = p.variants.find((v) => v.sku === sku) ?? leadVariant(p)
  const price = variant ? displayPrice(variant) : null
  const money = (minor: number) => formatShopPrice(minor, variant?.currency ?? catalog.currency)
  const canBuy = variant ? variant.availability !== 'out_of_stock' : false
  const related = catalog.products.filter((x) => x.slug !== p.slug && x.availability !== 'coming_soon' && x.categories[0] === p.categories[0]).slice(0, 4)

  return (
    <div className="page wrap" key={p.slug}>
      <div className="pdp">
        <div className="pdp-gallery">
          <div className="pdp-main">
            {shots[shot] && <img src={shots[shot].url} alt={shots[shot].alt} />}
          </div>
          {shots.length > 1 && (
            <div className="pdp-thumbs">
              {shots.map((s, i) => (
                <button key={s.url} className={i === shot ? 'is-active' : ''} onClick={() => setShot(i)} aria-label={`Photo ${i + 1}`}>
                  <img src={s.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="pdp-info">
          <p className="eyebrow">{variant?.title || p.shortDescription}</p>
          <h1 className="display pdp-title">{p.name}</h1>
          {price ? (
            <p className="pdp-price">
              {money(price.price)} {price.compareAt && <s>{money(price.compareAt)}</s>}
            </p>
          ) : (
            <p className="pdp-price">Coming soon</p>
          )}
          {p.variants.length > 1 && (
            <div className="pdp-variants tabs" role="radiogroup" aria-label="Size">
              {p.variants.map((v) => (
                <button key={v.sku} role="radio" aria-checked={v.sku === variant?.sku} className={`tab ${v.sku === variant?.sku ? 'is-active' : ''}`} onClick={() => setSku(v.sku)}>
                  {v.title || v.sku}
                  {v.availability === 'out_of_stock' ? ' · sold out' : ''}
                </button>
              ))}
            </div>
          )}
          {variant?.availability === 'low_stock' && <p className="pdp-stock">Only a few left.</p>}
          {variant && p.variants.length > 1 && <p className="pdp-stock">SKU {variant.sku}</p>}
          {p.description && <p className="pdp-desc">{p.description}</p>}

          {variant && !canBuy && (
            <div className="pdp-buy">
              <button className="btn btn-dark btn-block" disabled aria-disabled="true">Sold out</button>
            </div>
          )}
          {variant && canBuy && (
            <div className="pdp-buy">
              <div className="stepper stepper-lg" role="group" aria-label="Quantity">
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">−</button>
                <span>{qty}</span>
                <button onClick={() => setQty(qty + 1)} aria-label="Increase">+</button>
              </div>
              <button className="btn btn-dark grow" onClick={() => add(p.slug, qty)}>Add to bag</button>
              <button
                className="btn btn-gold btn-block"
                onClick={() => {
                  add(p.slug, qty)
                  useCart.getState().setOpen(false)
                  router.push('/checkout')
                }}
              >
                Buy now
              </button>
            </div>
          )}

          {p.slug === store.catalogue.heroProductSlug && (
            <Link href="/" className="link-arrow pdp-story">Open the bottle in 3D</Link>
          )}

          {p.notes.length > 0 && (
            <div className="pdp-notes">
              {p.notes.map((t) => (
                <div key={t.tier} className="tier">
                  <h3>{t.tier} notes</h3>
                  <ul>
                    {t.notes.map((n) => (
                      <li key={n}>
                        {hasNoteImage(n) && <img src={noteImage(n)} alt="" />}
                        <span className="tier-text">
                          <span>{n}</span>
                          {noteDescription[n] && <small>{noteDescription[n]}</small>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <ul className="pdp-facts">
            <li>Free shipping across India</li>
            <li>7 day returns</li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="related">
          <h2 className="display small">You may also like</h2>
          <div className="grid">
            {related.map((r) => (
              <ProductCard key={r.slug} p={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
