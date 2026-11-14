'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { store } from '../config/store'
import { formatShopPrice } from '../commerce/catalog/money'
import { leadVariant } from '../commerce/catalog/public'
import { useCatalog } from '../state/catalog'
import { cartTotal, unitPrice, useCart } from '../state/cart'
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
  const { catalog, bySlug } = useCatalog()
  const currency = catalog.currency
  const total = cartTotal(lines, catalog)

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
                    <img src={p.images[0]?.url} alt="" />
                    <div className="line-info">
                      <Link href={`/product/${p.slug}`} className="line-name">{p.name}</Link>
                      <span className="line-meta">{leadVariant(p)?.title || p.shortDescription}</span>
                      <div className="stepper" role="group" aria-label={`Quantity of ${p.name}`}>
                        <button onClick={() => setQty(l.slug, l.qty - 1)} aria-label="Decrease">−</button>
                        <span>{l.qty}</span>
                        <button onClick={() => setQty(l.slug, l.qty + 1)} aria-label="Increase">+</button>
                      </div>
                    </div>
                    <div className="line-end">
                      <span>{formatShopPrice(unitPrice(p) * l.qty, currency)}</span>
                      <button className="link-btn" onClick={() => remove(l.slug)}>Remove</button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="drawer-foot">
              <div className="row-between">
                <span>Subtotal</span>
                <strong>{formatShopPrice(total, currency)}</strong>
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
