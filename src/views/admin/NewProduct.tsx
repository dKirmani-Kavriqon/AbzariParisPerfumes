'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from './AdminShell'
import { adminApi } from './client'
import { flattenTree, type Cat } from './categoryTree'
import ProductForm, { emptyProduct, productBody } from './ProductForm'
import { useAdminData } from './ui'

export default function NewProduct() {
  const router = useRouter()
  const session = useSession()
  const currency = session?.store.currency ?? 'INR'
  const cats = useAdminData<Cat[]>('/api/admin/categories')
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow"><Link href="/admin/products">Products</Link></p>
          <h1 className="display">Add product</h1>
        </div>
      </div>
      <section className="admin-card">
        {cats.data ? (
          <ProductForm
            initial={emptyProduct}
            currency={currency}
            categories={flattenTree(cats.data)}
            withFirstVariant
            submitLabel="Create product"
            onSubmit={async (f, { categoryIds, variant }) => {
              const r = await adminApi<{ id: string }>('/api/admin/products', {
                json: {
                  ...productBody(f),
                  categoryIds,
                  variants: variant ? [{ sku: variant.sku.trim(), title: variant.title.trim(), priceMinor: variant.priceMinor, salePriceMinor: variant.salePriceMinor, initialStock: Number(variant.initialStock) }] : [],
                },
              })
              if (r.ok) router.push(`/admin/product?id=${r.data.id}`)
              return r.ok ? { ok: true } : { ok: false, message: r.message, fields: r.fields }
            }}
          />
        ) : (
          <p className="muted">{cats.error ?? 'Loading…'}</p>
        )}
      </section>
    </>
  )
}
