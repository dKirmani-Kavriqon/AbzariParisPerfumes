import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import { bySlug, formatINR, hasNoteImage, noteImage, products } from '../data/products'
import { useCart } from '../state/cart'

export default function ProductPage() {
  const { slug = '' } = useParams()
  const p = bySlug(slug)
  const add = useCart((s) => s.add)
  const nav = useNavigate()
  const [qty, setQty] = useState(1)
  const [shot, setShot] = useState(0)

  if (!p) {
    return (
      <div className="page wrap narrow">
        <h1 className="display">Not found</h1>
        <p>That fragrance is not in the collection. <Link to="/shop">See everything we make.</Link></p>
      </div>
    )
  }
  const shots = p.gallery ?? [p.image!]
  const related = products.filter((x) => x.category === p.category && x.slug !== p.slug && !x.soldOut).slice(0, 4)

  return (
    <div className="page wrap" key={p.slug}>
      <div className="pdp">
        <div className="pdp-gallery">
          <div className="pdp-main">
            <img src={shots[shot]} alt={`${p.name} by Abzari Paris`} />
          </div>
          {shots.length > 1 && (
            <div className="pdp-thumbs">
              {shots.map((s, i) => (
                <button key={s} className={i === shot ? 'is-active' : ''} onClick={() => setShot(i)} aria-label={`Photo ${i + 1}`}>
                  <img src={s} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="pdp-info">
          <p className="eyebrow">{p.size}</p>
          <h1 className="display pdp-title">{p.name}</h1>
          {!p.soldOut ? (
            <p className="pdp-price">
              {formatINR(p.price)} {p.compareAt && <s>{formatINR(p.compareAt)}</s>}
            </p>
          ) : (
            <p className="pdp-price">Coming soon</p>
          )}
          {p.description && <p className="pdp-desc">{p.description}</p>}

          {!p.soldOut && (
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
                  nav('/checkout')
                }}
              >
                Buy now
              </button>
            </div>
          )}

          {p.slug === 'rawah' && (
            <Link to="/" className="link-arrow pdp-story">Open the bottle in 3D</Link>
          )}

          {p.notes && (
            <div className="pdp-notes">
              {p.notes.map((t) => (
                <div key={t.tier} className="tier">
                  <h3>{t.tier} notes</h3>
                  <ul>
                    {t.notes.map((n) => (
                      <li key={n}>
                        {hasNoteImage(n) && <img src={noteImage(n)} alt="" />}
                        <span>{n}</span>
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
