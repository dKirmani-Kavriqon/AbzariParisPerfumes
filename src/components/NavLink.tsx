'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** A link that gets the `active` class on an exact path match, like react-router's `<NavLink end>`. */
export default function NavLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const active = usePathname() === href
  return (
    <Link href={href} className={active ? `${className} active` : className} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  )
}
