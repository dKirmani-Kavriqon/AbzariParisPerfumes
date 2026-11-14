'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { store } from '../config/store'
import { bySlug, formatINR } from '../data/products'
import { cartTotal, useCart } from '../state/cart'
import { CloseIcon } from './Icons'

export default function CartDrawer() {
  const { lines, open, setOpen, setQty, remove } = useCart()
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname, setOpen])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
  const total = cartTotal(lines)

  return (
    <>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-label="Your bag" aria-hidden={!open}>
        <div className="drawer-head">
          <h2>Your bag</h2>
          <button className="icon-btn" aria-label="Close bag" onClick={() => setOpen(false)}>
            <CloseIcon />
          </button>
        </div>
        {lines.length === 0 ? (
          <div className="drawer-empty">
            <p>Nothing here yet.</p>
            <Link href="/shop" className="btn btn-dark">Browse the collection</Link>
          </div>
        ) : (
          <>
            <ul className="drawer-lines">
              {lines.map((l) => {
                const p = bySlug(l.slug)
                if (!p) return null
                return (
                  <li key={l.slug} className="line">
                    <img src={p.image} alt="" />
                    <div className="line-info">
                      <Link href={`/product/${p.slug}`} className="line-name">{p.name}</Link>
                      <span className="line-meta">{p.size}</span>
                      <div className="stepper" role="group" aria-label={`Quantity of ${p.name}`}>
                        <button onClick={() => setQty(l.slug, l.qty - 1)} aria-label="Decrease">−</button>
                        <span>{l.qty}</span>
                        <button onClick={() => setQty(l.slug, l.qty + 1)} aria-label="Increase">+</button>
                      </div>
                    </div>
                    <div className="line-end">
                      <span>{formatINR(p.price * l.qty)}</span>
                      <button className="link-btn" onClick={() => remove(l.slug)}>Remove</button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="drawer-foot">
              <div className="row-between">
                <span>Subtotal</span>
                <strong>{formatINR(total)}</strong>
              </div>
              <p className="fine">{store.business.shippingNote}</p>
              <Link href="/checkout" className="btn btn-dark btn-block">Checkout</Link>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
