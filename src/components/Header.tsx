'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NavLink from './NavLink'
import logoInk from '../assets/brand/logo-ink.png'
import logoIvory from '../assets/brand/logo-ivory.png'
import { cartCount, useCart } from '../state/cart'
import { BagIcon, CloseIcon, MenuIcon } from './Icons'

const links = [
  { to: '/', label: 'Home' },
  { to: '/shop', label: 'Shop' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

export default function Header() {
  const pathname = usePathname()
  const items = useCart((s) => s.items)
  const setOpen = useCart((s) => s.setOpen)
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [heroH, setHeroH] = useState(0)
  const count = cartCount(items)

  useEffect(() => {
    const story = document.querySelector('.story') as HTMLElement | null
    setHeroH(story ? story.offsetHeight - window.innerHeight * 0.6 : 0)
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [pathname])

  useEffect(() => setMenu(false), [pathname])

  const [y, setY] = useState(0)
  useEffect(() => {
    const on = () => setY(window.scrollY)
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  const dark = pathname === '/' && y < heroH
  return (
    <header className={`site-header ${dark ? 'is-dark' : 'is-light'} ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="header-inner">
        <button className="icon-btn only-mobile" aria-label="Open menu" onClick={() => setMenu(true)}>
          <MenuIcon />
        </button>
        <nav className="nav only-desktop" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} href={l.to} className="nav-link">
              {l.label}
            </NavLink>
          ))}
        </nav>
        <Link href="/" className="brand" aria-label="Abzari Paris home">
          <img src={(dark ? logoIvory : logoInk).src} alt="Abzari Paris" />
        </Link>
        <div className="header-actions">
          <button className="icon-btn bag-btn" aria-label={`Bag, ${count} items`} onClick={() => setOpen(true)}>
            <BagIcon />
            {count > 0 && <span className="bag-count">{count}</span>}
          </button>
        </div>
      </div>
      <div className={`mobile-menu ${menu ? 'is-open' : ''}`} aria-hidden={!menu}>
        <button className="icon-btn mobile-close" aria-label="Close menu" onClick={() => setMenu(false)}>
          <CloseIcon />
        </button>
        {links.map((l) => (
          <NavLink key={l.to} href={l.to} className="mobile-link">
            {l.label}
          </NavLink>
        ))}
      </div>
    </header>
  )
}
