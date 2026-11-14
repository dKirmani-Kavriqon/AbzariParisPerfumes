'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { bySlug, formatINR } from '../data/products'
import { cartTotal, useCart } from '../state/cart'

export default function Checkout() {
  const { lines, clear } = useCart()
  const [order, setOrder] = useState<string | null>(null)
  const [pay, setPay] = useState('upi')
  const total = cartTotal(lines)

  const submit = (e: FormEvent) => {
    e.preventDefault()
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

  if (lines.length === 0) {
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
          <button className="btn btn-dark btn-block" type="submit">Place order · {formatINR(total)}</button>
          <p className="fine">Demo checkout. No payment is taken.</p>
        </form>
        <aside className="summary">
          <h2>Order summary</h2>
          <ul>
            {lines.map((l) => {
              const p = bySlug(l.slug)!
              return (
                <li key={l.slug}>
                  <span className="summary-img"><img src={p.image} alt="" /><b>{l.qty}</b></span>
                  <span className="summary-name">{p.name}<small>{p.size}</small></span>
                  <span>{formatINR(p.price * l.qty)}</span>
                </li>
              )
            })}
          </ul>
          <div className="row-between"><span>Shipping</span><span>Free</span></div>
          <div className="row-between total"><span>Total</span><strong>{formatINR(total)}</strong></div>
        </aside>
      </div>
    </div>
  )
}
