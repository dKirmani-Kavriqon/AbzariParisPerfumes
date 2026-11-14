'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { adminApi } from './client'

export type Session = { email: string | null; method: string; store: { code: string; name: string; currency: string } }
const SessionContext = createContext<Session | null>(null)
export const useSession = () => useContext(SessionContext)

const nav = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/inventory', label: 'Inventory' },
]

/** Admin frame. Checks the session first; nothing else loads unless the server accepts the caller. */
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi<Session>('/api/admin/session').then((r) => (r.ok ? setSession(r.data) : setError(r.message)))
  }, [])

  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href) || (href === '/admin/products' && pathname.startsWith('/admin/product')))

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-bar-inner">
          <Link href="/admin" className="admin-brand">
            {session?.store.name ?? 'Store'} · Admin
          </Link>
          <nav className="admin-nav" aria-label="Admin">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={active(n.href) ? 'active' : ''} aria-current={active(n.href) ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="admin-who">{session ? (session.email ?? 'Local development') : ''}</span>
        </div>
      </header>
      <main className="admin-main">
        {error ? (
          <div className="notice error" role="alert">
            <strong>Admin access is not available.</strong> {error}
          </div>
        ) : !session ? (
          <p className="muted">Checking access…</p>
        ) : (
          <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
        )}
      </main>
    </div>
  )
}
