'use client'

import { useState, type FormEvent } from 'react'
import { parseNotesText } from '../../commerce/catalog/notes-text'
import { slugify } from '../../commerce/catalog/slug'
import { Field, MoneyInput, Notice, TextArea, TextInput } from './ui'

export type ProductFields = {
  name: string
  slug: string
  brand: string
  productType: string
  shortDescription: string
  fullDescription: string
  status: 'draft' | 'active'
  featured: boolean
  seoTitle: string
  seoDescription: string
  /** Fragrance notes, one tier per line: "Top: Woody, Balsamic". */
  notesText: string
}

export type FirstVariant = { sku: string; title: string; priceMinor: number | null; salePriceMinor: number | null; initialStock: string }

export const emptyProduct: ProductFields = { name: '', slug: '', brand: '', productType: 'standard', shortDescription: '', fullDescription: '', status: 'draft', featured: false, seoTitle: '', seoDescription: '', notesText: '' }

/** Fields → API body (empty strings become null so optional fields are cleared, not set to ""). */
export function productBody(f: ProductFields) {
  const opt = (s: string) => (s.trim() ? s.trim() : null)
  const parsed = parseNotesText(f.notesText)
  return {
    details: { notes: parsed.ok ? parsed.notes : [] },
    name: f.name.trim(),
    slug: f.slug.trim() || undefined,
    brand: opt(f.brand),
    productType: f.productType.trim() || 'standard',
    shortDescription: opt(f.shortDescription),
    fullDescription: opt(f.fullDescription),
    status: f.status,
    featured: f.featured,
    seoTitle: opt(f.seoTitle),
    seoDescription: opt(f.seoDescription),
  }
}

type Props = {
  initial: ProductFields
  currency: string
  categories?: { id: string; name: string; depth: number }[]
  initialCategoryIds?: string[]
  withFirstVariant?: boolean
  submitLabel: string
  onSubmit: (fields: ProductFields, extra: { categoryIds: string[]; variant: FirstVariant | null }) => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> }>
}

export default function ProductForm({ initial, currency, categories, initialCategoryIds = [], withFirstVariant, submitLabel, onSubmit }: Props) {
  const [f, setF] = useState(initial)
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug))
  const [cats, setCats] = useState<string[]>(initialCategoryIds)
  const [variant, setVariant] = useState<FirstVariant>({ sku: '', title: '', priceMinor: null, salePriceMinor: null, initialStock: '0' })
  const [moneyValid, setMoneyValid] = useState({ price: true, sale: true })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof ProductFields>(k: K, v: ProductFields[K]) => setF((x) => ({ ...x, [k]: v }))
  const err = (k: string) => errors[k] ?? errors[`variants.0.${k}`]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const local: Record<string, string> = {}
    if (!f.name.trim()) local.name = 'Required.'
    const notes = parseNotesText(f.notesText)
    if (!notes.ok) local.notes = `Line ${notes.line}: write it as "Tier: note, note".`
    const useVariant = withFirstVariant && (variant.sku.trim() || variant.priceMinor != null)
    if (useVariant) {
      if (!variant.sku.trim()) local.sku = 'Required.'
      if (variant.priceMinor == null || !moneyValid.price) local.priceMinor = 'Enter a price, e.g. 1500 or 1499.50.'
      if (!moneyValid.sale) local.salePriceMinor = 'Enter a valid amount, or leave it empty.'
      if (variant.salePriceMinor != null && variant.priceMinor != null && variant.salePriceMinor >= variant.priceMinor) local.salePriceMinor = 'Must be lower than the regular price.'
      if (!/^\d+$/.test(variant.initialStock)) local.initialStock = 'Enter a whole number.'
    }
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    setMessage(null)
    const r = await onSubmit(f, { categoryIds: cats, variant: useVariant ? variant : null })
    setBusy(false)
    if (!r.ok) {
      setErrors(r.fields ?? {})
      setMessage({ kind: 'error', text: r.message ?? 'Could not save.' })
    } else setMessage({ kind: 'ok', text: 'Saved.' })
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <div className="grid-2">
        <Field label="Name" error={err('name')}>
          <TextInput
            value={f.name}
            required
            maxLength={200}
            onChange={(e) => {
              set('name', e.target.value)
              if (!slugTouched) set('slug', slugify(e.target.value))
            }}
          />
        </Field>
        <Field label="Slug (web address)" error={err('slug')} hint={f.slug ? `/product/${f.slug}` : 'Made from the name'}>
          <TextInput
            value={f.slug}
            maxLength={120}
            onChange={(e) => {
              setSlugTouched(true)
              set('slug', e.target.value.toLowerCase())
            }}
          />
        </Field>
        <Field label="Brand" error={err('brand')}>
          <TextInput value={f.brand} maxLength={100} onChange={(e) => set('brand', e.target.value)} />
        </Field>
        <Field label="Product type" error={err('productType')} hint="e.g. eau-de-parfum, perfume-oil">
          <TextInput value={f.productType} maxLength={60} onChange={(e) => set('productType', e.target.value)} />
        </Field>
      </div>
      <Field label="Short description" error={err('shortDescription')}>
        <TextArea rows={2} maxLength={500} value={f.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
      </Field>
      <Field label="Full description" error={err('fullDescription')}>
        <TextArea rows={6} maxLength={10000} value={f.fullDescription} onChange={(e) => set('fullDescription', e.target.value)} />
      </Field>
      <Field label="Fragrance notes" error={err('notes') ?? err('details')} hint='One tier per line, e.g. "Top: Woody, Balsamic, Powdery"'>
        <TextArea rows={3} value={f.notesText} onChange={(e) => set('notesText', e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Status" error={err('status')}>
          <select value={f.status} onChange={(e) => set('status', e.target.value as ProductFields['status'])}>
            <option value="draft">Draft (hidden)</option>
            <option value="active">Live</option>
          </select>
        </Field>
        <label className="check" style={{ alignSelf: 'end', minHeight: 44 }}>
          <input type="checkbox" checked={f.featured} onChange={(e) => set('featured', e.target.checked)} /> Featured
        </label>
      </div>
      <div className="grid-2">
        <Field label="SEO title" error={err('seoTitle')} hint={`${f.seoTitle.length}/70`}>
          <TextInput value={f.seoTitle} maxLength={70} onChange={(e) => set('seoTitle', e.target.value)} />
        </Field>
        <Field label="SEO description" error={err('seoDescription')} hint={`${f.seoDescription.length}/160`}>
          <TextInput value={f.seoDescription} maxLength={160} onChange={(e) => set('seoDescription', e.target.value)} />
        </Field>
      </div>

      {categories && (
        <fieldset>
          <legend>Categories</legend>
          {err('categoryIds') && <span className="field-error">{err('categoryIds')}</span>}
          {categories.length === 0 && <p className="muted">No categories yet.</p>}
          <div className="grid-2">
            {categories.map((c) => (
              <label key={c.id} className="check">
                <span className="tree-indent" style={{ width: c.depth * 18 }} />
                <input type="checkbox" checked={cats.includes(c.id)} onChange={(e) => setCats((x) => (e.target.checked ? [...x, c.id] : x.filter((i) => i !== c.id)))} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {withFirstVariant && (
        <fieldset>
          <legend>First variant</legend>
          <p className="muted" style={{ margin: 0 }}>Optional. Add more variants (sizes) after saving.</p>
          <div className="grid-2">
            <Field label="SKU" error={err('sku')}>
              <TextInput value={variant.sku} maxLength={64} onChange={(e) => setVariant((v) => ({ ...v, sku: e.target.value }))} />
            </Field>
            <Field label="Label" error={err('title')} hint="e.g. 50 ml">
              <TextInput value={variant.title} maxLength={80} onChange={(e) => setVariant((v) => ({ ...v, title: e.target.value }))} />
            </Field>
            <Field label={`Price (${currency})`} error={err('priceMinor')}>
              <MoneyInput value={variant.priceMinor} currency={currency} required onChange={(m, valid) => { setVariant((v) => ({ ...v, priceMinor: m })); setMoneyValid((s) => ({ ...s, price: valid })) }} />
            </Field>
            <Field label={`Sale price (${currency})`} error={err('salePriceMinor')} hint="Optional">
              <MoneyInput value={variant.salePriceMinor} currency={currency} onChange={(m, valid) => { setVariant((v) => ({ ...v, salePriceMinor: m })); setMoneyValid((s) => ({ ...s, sale: valid })) }} />
            </Field>
            <Field label="Opening stock" error={err('initialStock')}>
              <input type="number" min={0} step={1} value={variant.initialStock} onChange={(e) => setVariant((v) => ({ ...v, initialStock: e.target.value }))} />
            </Field>
          </div>
        </fieldset>
      )}

      <div className="row">
        <button className="btn btn-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  )
}
