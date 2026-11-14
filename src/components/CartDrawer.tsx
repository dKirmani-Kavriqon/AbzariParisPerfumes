'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { store } from '../config/store'
import { CART_MAX_QUANTITY } from '../commerce/cart/cart'
import { formatShopPrice } from '../commerce/catalog/money'
import { useCart } from '../state/cart'
import { useCartView, type CartRow } from '../state/cart-view'
import { CloseIcon } from './Icons'

export default function CartDrawer() {
  const { open, setOpen, setQuantity, remove, clear, refresh, notice, dismissNotice, error, status, items } = useCart()
  const view = useCartView()
  const pathname = usePathname()
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const money = (minor: number) => formatShopPrice(minor, view.currency)

  useEffect(() => setOpen(false), [pathname, setOpen])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
  // Keyboard users land in the bag when it opens and go back where they were when it closes.
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null
      closeRef.current?.focus({ preventScroll: true })
    } else {
      setConfirmClear(false)
      returnTo.current?.focus?.({ preventScroll: true })
      returnTo.current = null
    }
  }, [open])

  // Messages ("Rawah added to your bag") fade out after a while.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(dismissNotice, 15_000)
    return () => clearTimeout(t)
  }, [notice, dismissNotice])
  const recentNotice = notice

  return (
    <>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-label="Your bag" aria-hidden={!open} inert={!open}>
        <div className="drawer-head">
          <h2>Your bag</h2>
          <button ref={closeRef} className="icon-btn" aria-label="Close bag" onClick={() => setOpen(false)}>
            <CloseIcon />
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {recentNotice?.message ?? ''}
        </p>
        {recentNotice && recentNotice.kind !== 'unavailable' && (
          <p className={`drawer-notice ${recentNotice.kind === 'added' ? '' : 'is-warn'}`}>{recentNotice.message}</p>
        )}
        {items.length === 0 ? (
          <div className="drawer-empty">
            <p>Your bag is empty.</p>
            <p className="fine">Find something you love in the collection.</p>
            <Link href="/shop" className="btn btn-dark">Browse the collection</Link>
          </div>
        ) : (
          <>
            <ul className="drawer-lines">
              {view.rows.map((r) => (
                <CartLine key={r.sku} row={r} money={money} onQty={(q) => setQuantity(r.sku, q)} onRemove={() => remove(r.sku)} />
              ))}
            </ul>
            <div className="drawer-foot">
              <div className="row-between">
                <span>Subtotal</span>
                <strong aria-live="polite">{view.subtotalMinor != null ? money(view.subtotalMinor) : status === 'error' ? '—' : 'Checking…'}</strong>
              </div>
              {view.hasIssues && <p className="line-alert">Some items need your attention. They are not included in the subtotal.</p>}
              {status === 'error' && (
                <p className="line-alert" role="alert">
                  {error}{' '}
                  <button className="link-btn" onClick={() => void refresh()}>Try again</button>
                </p>
              )}
              <p className="fine">{store.business.shippingNote} Prices and availability are confirmed at checkout.</p>
              {view.canCheckout ? (
                <Link href="/checkout" className="btn btn-dark btn-block">Checkout</Link>
              ) : (
                <button className="btn btn-dark btn-block" disabled aria-disabled="true">
                  {view.checking ? 'Checking your bag…' : 'Checkout'}
                </button>
              )}
              <div className="drawer-clear">
                {confirmClear ? (
                  <>
                    <span>Remove everything from your bag?</span>
                    <button className="link-btn" onClick={() => { clear(); setConfirmClear(false) }}>Yes, clear bag</button>
                    <button className="link-btn" onClick={() => setConfirmClear(false)}>Keep items</button>
                  </>
                ) : (
                  <button className="link-btn" onClick={() => setConfirmClear(true)}>Clear bag</button>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function CartLine({ row: r, money, onQty, onRemove }: { row: CartRow; money: (m: number) => string; onQty: (q: number) => void; onRemove: () => void }) {
  const l = r.line
  const blocked = l?.status === 'sold_out' || l?.status === 'unavailable'
  const max = Math.min(CART_MAX_QUANTITY, l ? Math.max(l.maxQuantity, 1) : CART_MAX_QUANTITY)
  return (
    <li className={`line ${blocked ? 'is-unavailable' : ''}`}>
      {r.image ? <img src={r.image.url} alt="" /> : <span className="line-img-empty" aria-hidden="true" />}
      <div className="line-info">
        {r.slug ? (
          <Link href={`/product/${r.slug}`} className="line-name">{r.name}</Link>
        ) : (
          <span className="line-name">{r.name}</span>
        )}
        {r.size && <span className="line-meta">{r.size}</span>}
        {l?.unitPriceMinor != null && (
          <span className="line-meta">
            {money(l.unitPriceMinor)} each {l.compareAtMinor != null && <s>{money(l.compareAtMinor)}</s>}
          </span>
        )}
        {r.previousPriceMinor != null && <span className="line-note">Price updated (was {money(r.previousPriceMinor)}).</span>}
        {!blocked && (
          <div className="stepper" role="group" aria-label={`Quantity of ${r.name}`}>
            <button onClick={() => onQty(r.quantity - 1)} disabled={r.quantity <= 1} aria-label={`Decrease quantity of ${r.name}`}>−</button>
            <span aria-live="polite">{r.quantity}</span>
            <button onClick={() => onQty(r.quantity + 1)} disabled={r.quantity >= max} aria-label={`Increase quantity of ${r.name}`}>+</button>
          </div>
        )}
        {l?.status === 'insufficient_stock' && (
          <span className="line-alert">
            Only {l.maxQuantity} available.{' '}
            <button className="link-btn" onClick={() => onQty(l.maxQuantity)}>Change to {l.maxQuantity}</button>
          </span>
        )}
        {l?.status === 'sold_out' && <span className="line-alert">Sold out. Remove it to continue.</span>}
        {l?.status === 'unavailable' && <span className="line-alert">No longer available. Remove it to continue.</span>}
      </div>
      <div className="line-end">
        <span>{r.current && l?.status === 'ok' && l.lineTotalMinor != null ? money(l.lineTotalMinor) : blocked || l?.status === 'insufficient_stock' ? '' : '…'}</span>
        <button className="link-btn" onClick={onRemove} aria-label={`Remove ${r.name} from bag`}>Remove</button>
      </div>
    </li>
  )
}
