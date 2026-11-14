'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { adminImageUrl } from '../../commerce/catalog/image-url'
import { formatMoney } from '../../commerce/catalog/money'
import { notesToText } from '../../commerce/catalog/notes-text'
import { useSession } from './AdminShell'
import { adminApi } from './client'
import { flattenTree, type Cat } from './categoryTree'
import ProductForm, { productBody, type ProductFields } from './ProductForm'
import { Badge, Field, MoneyInput, Notice, TextInput, useAdminData } from './ui'

type Variant = { id: string; sku: string; barcode: string | null; title: string; priceMinor: number; salePriceMinor: number | null; currency: string; weightGrams: number | null; status: string; archivedAt: string | null; availableQuantity: number; lowStockThreshold: number }
type Image = { id: string; source: string; storageKey: string; altText: string; isPrimary: boolean; position: number; width: number | null; height: number | null }
type Product = Omit<ProductFields, 'status' | 'notesText'> & { details?: { notes?: { tier: string; notes: string[] }[] }; id: string; archivedAt: string | null; status: 'draft' | 'active' | 'archived'; categories: { id: string }[]; variants: Variant[]; images: Image[]; updatedAt: string }

const toFields = (p: Product): ProductFields => ({
  name: p.name,
  slug: p.slug,
  brand: p.brand ?? '',
  productType: p.productType,
  shortDescription: p.shortDescription ?? '',
  fullDescription: p.fullDescription ?? '',
  status: p.status === 'archived' ? 'draft' : p.status,
  featured: p.featured,
  seoTitle: p.seoTitle ?? '',
  seoDescription: p.seoDescription ?? '',
  notesText: notesToText(p.details?.notes),
})

export default function ProductEditor() {
  const id = useSearchParams().get('id') ?? ''
  const session = useSession()
  const currency = session?.store.currency ?? 'INR'
  const product = useAdminData<Product>(id ? `/api/admin/products/${id}` : null)
  const cats = useAdminData<Cat[]>('/api/admin/categories')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  if (!id) return <Notice kind="error">No product selected. <Link href="/admin/products">Back to products</Link></Notice>
  if (product.error) return <Notice kind="error">{product.error}</Notice>
  const p = product.data
  if (!p || !cats.data) return <p className="muted">Loading…</p>
  const archived = Boolean(p.archivedAt)

  async function lifecycle(action: 'archive' | 'restore') {
    if (action === 'archive' && !confirm('Archive this product? It disappears from the shop but nothing is deleted.')) return
    const r = await adminApi(`/api/admin/products/${id}/${action}`, { method: 'POST' })
    setNotice(r.ok ? { kind: 'ok', text: action === 'archive' ? 'Archived.' : 'Restored as a draft.' } : { kind: 'error', text: r.message })
    void product.reload()
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow"><Link href="/admin/products">Products</Link></p>
          <h1 className="display">{p.name}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <Badge status={p.status} />
            {p.status === 'active' && <a className="muted" href={`/product/${p.slug}`} target="_blank" rel="noreferrer">View in shop ↗</a>}
          </div>
        </div>
        <div className="row">
          {archived ? (
            <button className="btn btn-line" onClick={() => lifecycle('restore')}>Restore</button>
          ) : (
            <button className="btn btn-danger" onClick={() => lifecycle('archive')}>Archive</button>
          )}
        </div>
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {archived && <Notice>This product is archived. Restore it to make changes.</Notice>}

      {!archived && (
        <section className="admin-card">
          <h2>Details</h2>
          <ProductForm
            key={p.updatedAt}
            initial={toFields(p)}
            currency={currency}
            categories={flattenTree(cats.data)}
            initialCategoryIds={p.categories.map((c) => c.id)}
            submitLabel="Save details"
            onSubmit={async (f, { categoryIds }) => {
              const r = await adminApi(`/api/admin/products/${id}`, { method: 'PATCH', json: { ...productBody(f), slug: f.slug.trim() } })
              if (!r.ok) return { ok: false, message: r.message, fields: r.fields }
              const c = await adminApi(`/api/admin/products/${id}/categories`, { method: 'PUT', json: { categoryIds } })
              if (!c.ok) return { ok: false, message: c.message, fields: c.fields }
              void product.reload()
              return { ok: true }
            }}
          />
        </section>
      )}

      <Variants productId={id} variants={p.variants} currency={currency} disabled={archived} onChange={product.reload} />
      <Images productId={id} images={p.images} disabled={archived} onChange={product.reload} />
    </>
  )
}

function Variants({ productId, variants, currency, disabled, onChange }: { productId: string; variants: Variant[]; currency: string; disabled: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  return (
    <section className="admin-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Variants</h2>
        {!disabled && editing !== 'new' && <button className="btn btn-line" onClick={() => setEditing('new')}>Add variant</button>}
      </div>
      {variants.length === 0 && editing !== 'new' && <p className="muted">No variants yet. A product needs at least one variant (with a SKU and price) to be sold.</p>}
      {variants.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>SKU</th><th>Label</th><th>Price</th><th>Sale</th><th>Stock</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td><code>{v.sku}</code></td>
                  <td>{v.title || '–'}</td>
                  <td>{formatMoney(v.priceMinor, v.currency)}</td>
                  <td>{v.salePriceMinor != null ? formatMoney(v.salePriceMinor, v.currency) : '–'}</td>
                  <td>
                    {v.availableQuantity} {v.availableQuantity <= v.lowStockThreshold && <span className="admin-badge low">low</span>}
                  </td>
                  <td><Badge status={v.status} /></td>
                  <td className="row">
                    {!disabled && !v.archivedAt && <button className="btn btn-line" onClick={() => setEditing(v.id)}>Edit</button>}
                    <Link className="btn btn-line" href={`/admin/inventory?variant=${v.id}`}>Stock</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <VariantForm
          productId={productId}
          variant={editing === 'new' ? null : (variants.find((v) => v.id === editing) ?? null)}
          currency={currency}
          onDone={() => {
            setEditing(null)
            onChange()
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  )
}

function VariantForm({ productId, variant, currency, onDone, onCancel }: { productId: string; variant: Variant | null; currency: string; onDone: () => void; onCancel: () => void }) {
  const [sku, setSku] = useState(variant?.sku ?? '')
  const [title, setTitle] = useState(variant?.title ?? '')
  const [barcode, setBarcode] = useState(variant?.barcode ?? '')
  const [price, setPrice] = useState<number | null>(variant?.priceMinor ?? null)
  const [sale, setSale] = useState<number | null>(variant?.salePriceMinor ?? null)
  const [valid, setValid] = useState({ price: true, sale: true })
  const [weight, setWeight] = useState(variant?.weightGrams != null ? String(variant.weightGrams) : '')
  const [stock, setStock] = useState('0')
  const [status, setStatus] = useState(variant?.status === 'inactive' ? 'inactive' : 'active')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function checkSku() {
    if (!sku.trim()) return
    const q = new URLSearchParams({ sku: sku.trim(), ...(variant ? { excludeVariantId: variant.id } : {}) })
    const r = await adminApi<{ available: boolean }>(`/api/admin/skus/availability?${q}`)
    if (r.ok) setErrors((e) => ({ ...e, sku: r.data.available ? '' : 'This SKU is already used in this store.' }))
    else setErrors((e) => ({ ...e, sku: r.fields.sku ?? r.message }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const local: Record<string, string> = {}
    if (!sku.trim()) local.sku = 'Required.'
    if (price == null || !valid.price) local.priceMinor = 'Enter a price, e.g. 1500 or 1499.50.'
    if (!valid.sale) local.salePriceMinor = 'Enter a valid amount, or leave it empty.'
    if (sale != null && price != null && sale >= price) local.salePriceMinor = 'Must be lower than the regular price.'
    if (weight && !/^\d+$/.test(weight)) local.weightGrams = 'Whole grams.'
    if (!variant && !/^\d+$/.test(stock)) local.initialStock = 'Enter a whole number.'
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    const body = { sku: sku.trim(), title: title.trim(), barcode: barcode.trim() || null, priceMinor: price, salePriceMinor: sale, weightGrams: weight ? Number(weight) : null, status }
    const r = variant
      ? await adminApi(`/api/admin/variants/${variant.id}`, { method: 'PATCH', json: body })
      : await adminApi(`/api/admin/products/${productId}/variants`, { json: { ...body, initialStock: Number(stock) } })
    setBusy(false)
    if (r.ok) onDone()
    else {
      setErrors(r.fields)
      setMessage(r.message)
    }
  }

  async function archive() {
    if (!variant || !confirm('Archive this variant? It stays in the stock history but can no longer be sold.')) return
    const r = await adminApi(`/api/admin/variants/${variant.id}/archive`, { method: 'POST' })
    if (r.ok) onDone()
    else setMessage(r.message)
  }

  return (
    <form className="form" onSubmit={submit} noValidate style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
      <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>{variant ? `Edit ${variant.sku}` : 'New variant'}</h3>
      {message && <Notice kind="error">{message}</Notice>}
      <div className="grid-2">
        <Field label="SKU" error={errors.sku}><TextInput value={sku} maxLength={64} onChange={(e) => setSku(e.target.value)} onBlur={checkSku} /></Field>
        <Field label="Label" error={errors.title} hint="e.g. 50 ml"><TextInput value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={`Price (${currency})`} error={errors.priceMinor}>
          <MoneyInput value={price} currency={currency} required onChange={(m, ok) => { setPrice(m); setValid((v) => ({ ...v, price: ok })) }} />
        </Field>
        <Field label={`Sale price (${currency})`} error={errors.salePriceMinor} hint="Optional">
          <MoneyInput value={sale} currency={currency} onChange={(m, ok) => { setSale(m); setValid((v) => ({ ...v, sale: ok })) }} />
        </Field>
        <Field label="Barcode" error={errors.barcode} hint="Optional"><TextInput value={barcode} maxLength={64} onChange={(e) => setBarcode(e.target.value)} /></Field>
        <Field label="Weight (grams)" error={errors.weightGrams} hint="For shipping, optional"><input type="number" min={0} step={1} value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
        {!variant && <Field label="Opening stock" error={errors.initialStock}><input type="number" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} /></Field>}
        <Field label="Status" error={errors.status}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive (not for sale)</option>
          </select>
        </Field>
      </div>
      <div className="row">
        <button className="btn btn-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : variant ? 'Save variant' : 'Add variant'}</button>
        <button className="btn btn-line" type="button" onClick={onCancel}>Cancel</button>
        {variant && <button className="btn btn-danger" type="button" onClick={archive} style={{ marginLeft: 'auto' }}>Archive variant</button>}
      </div>
    </form>
  )
}

function Images({ productId, images, disabled, onChange }: { productId: string; images: Image[]; disabled: boolean; onChange: () => void }) {
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [staticPath, setStaticPath] = useState('')
  const ordered = [...images].sort((a, b) => a.position - b.position)

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    setMessage(r.ok ? { kind: 'ok', text: ok } : { kind: 'error', text: r.message ?? 'Failed.' })
    onChange()
  }
  const move = (i: number, dir: -1 | 1) => {
    const ids = ordered.map((x) => x.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(async () => { const r = await adminApi(`/api/admin/products/${productId}/images/order`, { method: 'PUT', json: { imageIds: ids } }); return r.ok ? { ok: true } : { ok: false, message: r.message } }, 'Order saved.')
  }

  return (
    <section className="admin-card">
      <h2>Images</h2>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      {ordered.length === 0 && <p className="muted">No images yet.</p>}
      <div className="images" style={{ marginTop: 12 }}>
        {ordered.map((img, i) => (
          <figure key={img.id} className={`image-tile ${img.isPrimary ? 'primary' : ''}`} style={{ margin: 0 }}>
            <img src={adminImageUrl(img.source, img.storageKey)} alt={img.altText} />
            <figcaption className="muted" style={{ fontSize: 12 }}>{img.isPrimary ? 'Primary · ' : ''}{img.width && img.height ? `${img.width}×${img.height}` : img.source}</figcaption>
            {!disabled && (
              <>
                <AltText image={img} onSaved={onChange} />
                <div className="row">
                  <button className="btn btn-line" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">←</button>
                  <button className="btn btn-line" disabled={busy || i === ordered.length - 1} onClick={() => move(i, 1)} aria-label="Move later">→</button>
                  {!img.isPrimary && <button className="btn btn-line" disabled={busy} onClick={() => run(async () => { const r = await adminApi(`/api/admin/images/${img.id}/primary`, { method: 'POST' }); return r.ok ? { ok: true } : { ok: false, message: r.message } }, 'Primary image set.')}>Primary</button>}
                  <button className="btn btn-danger" disabled={busy} onClick={() => confirm('Remove this image?') && run(async () => { const r = await adminApi(`/api/admin/images/${img.id}`, { method: 'DELETE' }); return r.ok ? { ok: true } : { ok: false, message: r.message } }, 'Image removed.')}>Remove</button>
                </div>
              </>
            )}
          </figure>
        ))}
      </div>

      {!disabled && (
        <div className="grid-2" style={{ marginTop: 20 }}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              const file = form.get('file')
              if (!(file instanceof File) || !file.size) return setMessage({ kind: 'error', text: 'Choose an image first.' })
              void run(async () => {
                const r = await adminApi(`/api/admin/products/${productId}/images`, { form })
                return r.ok ? { ok: true } : { ok: false, message: r.fields.file ?? r.message }
              }, 'Image uploaded.')
              e.currentTarget.reset()
            }}
          >
            <Field label="Upload an image" hint="JPEG, PNG, WebP or AVIF, up to 5 MB">
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif" />
            </Field>
            <Field label="Alt text (describe the photo)"><input type="text" name="altText" maxLength={250} /></Field>
            <div><button className="btn btn-dark" type="submit" disabled={busy}>Upload</button></div>
          </form>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                const r = await adminApi(`/api/admin/products/${productId}/images`, { json: { source: 'static', path: staticPath.trim() } })
                if (r.ok) setStaticPath('')
                return r.ok ? { ok: true } : { ok: false, message: r.fields.path ?? r.message }
              }, 'Image added.')
            }}
          >
            <Field label="Or use a photo that ships with the site" hint="e.g. /products/rawah-duo.webp">
              <TextInput value={staticPath} onChange={(e) => setStaticPath(e.target.value)} />
            </Field>
            <div><button className="btn btn-line" type="submit" disabled={busy || !staticPath.trim()}>Add</button></div>
          </form>
        </div>
      )}
    </section>
  )
}

function AltText({ image, onSaved }: { image: Image; onSaved: () => void }) {
  const [alt, setAlt] = useState(image.altText)
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')
  return (
    <input
      type="text"
      aria-label="Alt text"
      placeholder="Alt text"
      value={alt}
      maxLength={250}
      style={{ font: 'inherit', fontSize: 13, padding: '6px 8px', border: `1px solid ${state === 'error' ? '#c0583a' : 'var(--line)'}`, borderRadius: 6 }}
      onChange={(e) => setAlt(e.target.value)}
      onBlur={async () => {
        if (alt === image.altText) return
        const r = await adminApi(`/api/admin/images/${image.id}`, { method: 'PATCH', json: { altText: alt } })
        setState(r.ok ? 'saved' : 'error')
        if (r.ok) onSaved()
      }}
    />
  )
}
