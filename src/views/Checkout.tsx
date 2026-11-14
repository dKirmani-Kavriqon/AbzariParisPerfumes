'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { formatShopPrice } from '../commerce/catalog/money'
import { cartStore, useCart } from '../state/cart'
import { useCartView } from '../state/cart-view'

export default function Checkout() {
  const { items, clear, refresh, hydrated, status, error, setOpen, acknowledgePrices } = useCart()
  const view = useCartView()
  const [order, setOrder] = useState<string | null>(null)
  const [pay, setPay] = useState('upi')
  const money = (minor: number) => formatShopPrice(minor, view.currency)
  const total = view.subtotalMinor

  // Opening checkout always rechecks prices and stock (the bag may have been sitting for days).
  // On a full page load, restoring the bag has already started that check.
  useEffect(() => {
    const s = cartStore.getState()
    if (s.items.length && s.status !== 'checking') void s.refresh()
  }, [])
  useEffect(() => () => acknowledgePrices(), [acknowledgePrices])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!view.canCheckout) return
    setOrder('AZ' + Math.floor(100000 + Math.random() * 900000))
    clear()
    window.scrollTo(0, 0)
  }

  if (order) {
    return (
      <div className="page wrap narrow center">
        <p className="eyebrow">Order {order}</p>
        <h1 className="display">Thank you.</h1>
        <p className="lede">Your order is in. We will be in touch when it ships.</p>
        <p className="fine">This is a demo store. No payment was taken and nothing will ship.</p>
        <Link href="/shop" className="btn btn-dark">Keep browsing</Link>
      </div>
    )
  }

  if (!hydrated) return <div className="page wrap" style={{ minHeight: '60vh' }} aria-busy="true" />

  if (items.length === 0) {
    return (
      <div className="page wrap narrow center">
        <h1 className="display">Your bag is empty</h1>
        <Link href="/shop" className="btn btn-dark">Browse the collection</Link>
      </div>
    )
  }

  return (
    <div className="page wrap">
      <header className="page-head">
        <p className="eyebrow">Checkout</p>
        <h1 className="display">Almost yours</h1>
      </header>
      <div className="checkout">
        <form className="form" onSubmit={submit}>
          <fieldset>
            <legend>Contact</legend>
            <div className="field-row">
              <label className="field"><span>Full name</span><input required name="name" autoComplete="name" /></label>
              <label className="field"><span>Phone</span><input required name="phone" type="tel" autoComplete="tel" inputMode="tel" /></label>
            </div>
            <label className="field"><span>Email</span><input required name="email" type="email" autoComplete="email" /></label>
          </fieldset>
          <fieldset>
            <legend>Delivery</legend>
            <label className="field"><span>Address</span><input required name="address" autoComplete="street-address" /></label>
            <div className="field-row">
              <label className="field"><span>City</span><input required name="city" autoComplete="address-level2" /></label>
              <label className="field"><span>PIN code</span><input required name="pin" inputMode="numeric" pattern="[0-9]{6}" autoComplete="postal-code" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Payment</legend>
            {[
              { id: 'upi', t: 'UPI', d: 'GPay, PhonePe, Paytm' },
              { id: 'card', t: 'Card', d: 'Visa, Mastercard, RuPay' },
              { id: 'cod', t: 'Cash on delivery', d: 'Pay when it arrives' },
            ].map((o) => (
              <label key={o.id} className={`choice ${pay === o.id ? 'is-on' : ''}`}>
                <input type="radio" name="pay" value={o.id} checked={pay === o.id} onChange={() => setPay(o.id)} />
                <strong>{o.t}</strong>
                <span>{o.d}</span>
              </label>
            ))}
          </fieldset>
          {status === 'error' && (
            <p className="line-alert" role="alert">
              {error}{' '}
              <button type="button" className="link-btn" onClick={() => void refresh()}>Try again</button>
            </p>
          )}
          <button className="btn btn-dark btn-block" type="submit" disabled={!view.canCheckout} aria-disabled={!view.canCheckout}>
            {view.canCheckout && total != null ? `Place order · ${money(total)}` : view.checking ? 'Checking your bag…' : 'Place order'}
          </button>
          <p className="fine">Demo checkout. No payment is taken.</p>
        </form>
        <aside className="summary">
          <h2>Order summary</h2>
          <ul>
            {view.rows.map((r) => (
              <li key={r.sku} className={r.line && r.line.status !== 'ok' ? 'is-unavailable' : ''}>
                <span className="summary-img">{r.image && <img src={r.image.url} alt="" />}<b>{r.quantity}</b></span>
                <span className="summary-name">
                  {r.name}
                  <small>{r.size}</small>
                  {r.line?.status === 'insufficient_stock' && <small className="line-alert">Only {r.line.maxQuantity} available</small>}
                  {r.line?.status === 'sold_out' && <small className="line-alert">Sold out</small>}
                  {r.line?.status === 'unavailable' && <small className="line-alert">No longer available</small>}
                  {r.previousPriceMinor != null && <small className="line-note">Price updated (was {money(r.previousPriceMinor)})</small>}
                </span>
                <span>{r.current && r.line?.status === 'ok' && r.line.lineTotalMinor != null ? money(r.line.lineTotalMinor) : r.line?.status === 'ok' || !r.line ? '…' : ''}</span>
              </li>
            ))}
          </ul>
          {view.hasIssues && (
            <p className="line-alert" role="alert">
              Some items are sold out, unavailable or short on stock.{' '}
              <button type="button" className="link-btn" onClick={() => setOpen(true)}>Review your bag</button>
            </p>
          )}
          <div className="row-between"><span>Shipping</span><span>Free</span></div>
          <div className="row-between total"><span>Total</span><strong aria-live="polite">{view.canCheckout && total != null ? money(total) : view.checking ? 'Checking…' : '—'}</strong></div>
        </aside>
      </div>
    </div>
  )
}
