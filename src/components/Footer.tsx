import { Link } from 'react-router-dom'
import logoIvory from '../assets/brand/logo-ivory.png'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <img src={logoIvory} alt="Abzari Paris" />
          <p>Fragrance from a family that has worked with perfume for generations.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <Link to="/shop?c=parfum">Eau de Parfum</Link>
          <Link to="/shop?c=oil">Perfume Oils</Link>
          <Link to="/shop?c=soon">Bakhoor</Link>
          <Link to="/shop?c=soon">Natural Oils</Link>
        </div>
        <div>
          <h4>House</h4>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/policies">Shipping and returns</Link>
          <Link to="/policies">Terms and privacy</Link>
        </div>
        <div>
          <h4>Talk to us</h4>
          <a href="tel:+918796924324">+91 87969 24324</a>
          <a href="mailto:info@abzariparis.com">info@abzariparis.com</a>
          <p className="footer-addr">259A/3 Nayyar Manzil, Noor Nagar, Jamia Nagar, New Delhi 110025</p>
          <p className="footer-addr">Support every day, around the clock</p>
        </div>
      </div>
      <div className="footer-base">
        <span>© 2026 Abzari Paris</span>
        <span>Site by Kavriqon Technologies</span>
      </div>
    </footer>
  )
}
