import Link from 'next/link'
import { store } from '../config/store'
import logoIvory from '../assets/brand/logo-ivory.png'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <img src={logoIvory.src} alt={store.name} />
          <p>Fragrance from a family that has worked with perfume for generations.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <Link href="/shop?c=parfum">Eau de Parfum</Link>
          <Link href="/shop?c=oil">Perfume Oils</Link>
          <Link href="/shop?c=soon">Bakhoor</Link>
          <Link href="/shop?c=soon">Natural Oils</Link>
        </div>
        <div>
          <h4>House</h4>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/policies">Shipping and returns</Link>
          <Link href="/policies">Terms and privacy</Link>
        </div>
        <div>
          <h4>Talk to us</h4>
          <a href={`tel:${store.contact.phoneE164}`}>{store.contact.phoneDisplay}</a>
          <a href={`mailto:${store.contact.email}`}>{store.contact.email}</a>
          {store.contact.addressLines.map((l) => (
            <p key={l} className="footer-addr">{l}</p>
          ))}
          <p className="footer-addr">{store.contact.supportHours}</p>
        </div>
      </div>
      <div className="footer-base">
        <span>© 2026 {store.business.legalName}</span>
        <span>{store.credit}</span>
      </div>
    </footer>
  )
}
