import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../../styles/admin.css'
import AdminShell from '../../views/admin/AdminShell'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
