'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { adminApi } from './client'
import { dateTime, Field, Notice, TextInput, useAdminData } from './ui'

type Row = { variantId: string; sku: string; variantTitle: string; productId: string; productName: string; availableQuantity: number; reservedQuantity: number; lowStockThreshold: number; isLow: boolean }
type Movement = { id: string; movementType: string; quantityChange: number; previousQuantity: number; resultingQuantity: number; reason: string | null; reference: string | null; actor: string | null; createdAt: string }
type Detail = { stock: Row & { updatedAt: string }; movements: Movement[] }

const types = [
  ['restock', 'Restock (adds)'],
  ['return', 'Customer return (adds)'],
  ['damage', 'Damaged / lost (removes)'],
  ['correction', 'Stock count correction'],
] as const

export default function Inventory() {
  const params = useSearchParams()
  const router = useRouter()
  const lowStock = params.get('lowStock') === 'true'
  const selected = params.get('variant')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const list = useAdminData<Row[]>(`/api/admin/inventory?limit=200${lowStock ? '&lowStock=true' : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`)

  const open = (variantId: string | null) => {
    const p = new URLSearchParams(params.toString())
    if (variantId) p.set('variant', variantId)
    else p.delete('variant')
    router.push(`/admin/inventory${p.size ? `?${p}` : ''}`)
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="display">Inventory</h1>
        </div>
      </div>

      {selected && <StockDetail variantId={selected} onClose={() => open(null)} onChanged={list.reload} />}

      <section className="admin-card">
        <form className="row" style={{ marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()) }}>
          <label className="field" style={{ flex: '1 1 240px' }}>
            <span className="sr-only">Search</span>
            <input type="search" placeholder="Search by product or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button className="btn btn-line" type="submit">Search</button>
          <label className="check">
            <input type="checkbox" checked={lowStock} onChange={(e) => router.push(`/admin/inventory${e.target.checked ? '?lowStock=true' : ''}`)} /> Low stock only
          </label>
        </form>
        {list.error && <p className="field-error">{list.error}</p>}
        {list.data && list.data.length === 0 && <p className="muted">{lowStock ? 'Nothing is low on stock.' : 'No variants yet.'}</p>}
        {list.data && list.data.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Product</th><th>SKU</th><th>Available</th><th>Reserved</th><th>Low at</th><th></th></tr></thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.variantId}>
                    <td><Link href={`/admin/product?id=${r.productId}`}>{r.productName}</Link>{r.variantTitle ? <span className="muted"> · {r.variantTitle}</span> : null}</td>
                    <td><code>{r.sku}</code></td>
                    <td>{r.availableQuantity} {r.isLow && <span className="admin-badge low">low</span>}</td>
                    <td>{r.reservedQuantity}</td>
                    <td>{r.lowStockThreshold}</td>
                    <td><button className="btn btn-line" onClick={() => open(r.variantId)}>Adjust</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function StockDetail({ variantId, onClose, onChanged }: { variantId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useAdminData<Detail>(`/api/admin/variants/${variantId}/inventory?limit=50`)
  const [type, setType] = useState<(typeof types)[number][0]>('restock')
  const [qty, setQty] = useState('')
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [threshold, setThreshold] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (detail.error) return <Notice kind="error">{detail.error}</Notice>
  const d = detail.data
  if (!d) return <p className="muted">Loading stock…</p>

  // Restocks and returns add, damage removes; a correction goes the way the person chose.
  const signed = (n: number) => (type === 'damage' || (type === 'correction' && direction === 'remove') ? -n : n)

  async function adjust(e: FormEvent) {
    e.preventDefault()
    const n = Number(qty.trim())
    if (!/^\d+$/.test(qty.trim()) || n === 0) return setErrors({ quantityChange: 'Enter a whole number greater than 0.' })
    setBusy(true)
    setMessage(null) // never leave the previous change's message showing while this one saves
    const r = await adminApi(`/api/admin/variants/${variantId}/inventory/adjustments`, { json: { type, quantityChange: signed(n), reason: reason.trim() || null, reference: reference.trim() || null } })
    setBusy(false)
    if (r.ok) {
      setQty('')
      setReason('')
      setReference('')
      setErrors({})
      setMessage({ kind: 'ok', text: 'Stock updated.' })
      void detail.reload()
      onChanged()
    } else {
      setErrors(r.fields)
      setMessage({ kind: 'error', text: r.message })
    }
  }

  async function saveThreshold() {
    if (threshold === null || !/^\d+$/.test(threshold)) return setErrors({ lowStockThreshold: 'Whole number, 0 or more.' })
    const r = await adminApi(`/api/admin/variants/${variantId}/inventory/threshold`, { method: 'PUT', json: { lowStockThreshold: Number(threshold) } })
    setMessage(r.ok ? { kind: 'ok', text: 'Low-stock level saved.' } : { kind: 'error', text: r.message })
    if (r.ok) {
      setThreshold(null)
      void detail.reload()
      onChanged()
    }
  }

  return (
    <section className="admin-card" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{d.stock.productName} <span className="muted" style={{ fontSize: 18 }}>{d.stock.sku}</span></h2>
        <button className="btn btn-line" onClick={onClose}>Close</button>
      </div>
      <p style={{ fontSize: 18 }}>
        <strong>{d.stock.availableQuantity}</strong> available · {d.stock.reservedQuantity} reserved {d.stock.isLow && <span className="admin-badge low">low</span>}
      </p>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <div className="grid-2" style={{ marginTop: 12 }}>
        <form className="form" onSubmit={adjust} noValidate>
          <Field label="Change type"><select value={type} onChange={(e) => setType(e.target.value as typeof type)}>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {type === 'correction' && (
            <Field label="Direction">
              <select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}>
                <option value="add">Add to stock</option>
                <option value="remove">Remove from stock</option>
              </select>
            </Field>
          )}
          <Field label="Quantity" error={errors.quantityChange}><input type="text" inputMode="numeric" pattern="[0-9]*" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label={type === 'correction' || type === 'damage' ? 'Reason (required)' : 'Reason'} error={errors.reason}><TextInput value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Reference" hint="e.g. supplier invoice number" error={errors.reference}><TextInput value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} /></Field>
          <div><button className="btn btn-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record change'}</button></div>
        </form>
        <div className="form">
          <Field label="Low-stock level" hint="Flag this item when available stock is at or below this number" error={errors.lowStockThreshold}>
            <input type="number" min={0} step={1} value={threshold ?? String(d.stock.lowStockThreshold)} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
          <div><button className="btn btn-line" type="button" onClick={saveThreshold} disabled={threshold === null}>Save level</button></div>
        </div>
      </div>
      <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 22, margin: '24px 0 8px' }}>History</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>When</th><th>Type</th><th>Change</th><th>Before → after</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {d.movements.map((m) => (
              <tr key={m.id}>
                <td>{dateTime(m.createdAt)}</td>
                <td>{m.movementType}</td>
                <td>{m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}</td>
                <td>{m.previousQuantity} → {m.resultingQuantity}</td>
                <td>{[m.reason, m.reference].filter(Boolean).join(' · ') || '–'}</td>
                <td className="muted">{m.actor ?? '–'}</td>
              </tr>
            ))}
            {d.movements.length === 0 && <tr><td colSpan={6} className="muted">No movements yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
