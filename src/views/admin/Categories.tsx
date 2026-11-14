'use client'

import { useState, type FormEvent } from 'react'
import { slugify } from '../../commerce/catalog/slug'
import { adminApi } from './client'
import { flattenTree, type Cat } from './categoryTree'
import { Badge, Field, Notice, TextArea, TextInput, useAdminData } from './ui'

export default function Categories() {
  const [showArchived, setShowArchived] = useState(false)
  const cats = useAdminData<Cat[]>(`/api/admin/categories${showArchived ? '?includeArchived=true' : ''}`)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const tree = cats.data ? flattenTree(cats.data) : []

  async function act(c: Cat, action: 'archive' | 'restore') {
    const r = await adminApi(`/api/admin/categories/${c.id}/${action}`, { method: 'POST' })
    setMessage(r.ok ? { kind: 'ok', text: action === 'archive' ? `Archived “${c.name}”.` : `Restored “${c.name}”.` } : { kind: 'error', text: r.message })
    void cats.reload()
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="display">Categories</h1>
        </div>
        {editing !== 'new' && <button className="btn btn-dark" onClick={() => setEditing('new')}>Add category</button>}
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      {editing === 'new' && cats.data && (
        <section className="admin-card" style={{ marginBottom: 20 }}>
          <h2>New category</h2>
          <CategoryForm all={cats.data} category={null} onDone={() => { setEditing(null); void cats.reload() }} onCancel={() => setEditing(null)} />
        </section>
      )}
      <section className="admin-card">
        <label className="check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        {cats.error && <p className="field-error">{cats.error}</p>}
        {cats.data && tree.length === 0 && <p className="muted">No categories yet.</p>}
        {tree.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Slug</th><th>Products</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {tree.map((c) =>
                  editing === c.id ? (
                    <tr key={c.id}>
                      <td colSpan={5}>
                        <CategoryForm all={cats.data!} category={c} onDone={() => { setEditing(null); void cats.reload() }} onCancel={() => setEditing(null)} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td><span className="tree-indent" style={{ width: c.depth * 18 }} />{c.depth > 0 ? '↳ ' : ''}{c.name}</td>
                      <td className="muted">{c.slug}</td>
                      <td>{c.productCount}</td>
                      <td><Badge status={c.status} /></td>
                      <td className="row">
                        {c.archivedAt ? (
                          <button className="btn btn-line" onClick={() => act(c, 'restore')}>Restore</button>
                        ) : (
                          <>
                            <button className="btn btn-line" onClick={() => setEditing(c.id)}>Edit</button>
                            <button className="btn btn-danger" onClick={() => confirm(`Archive “${c.name}”?`) && act(c, 'archive')}>Archive</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function CategoryForm({ all, category, onDone, onCancel }: { all: Cat[]; category: Cat | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(category))
  const [description, setDescription] = useState(category?.description ?? '')
  const [parentId, setParentId] = useState(category?.parentId ?? '')
  const [status, setStatus] = useState(category?.status === 'hidden' ? 'hidden' : 'active')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const parents = flattenTree(all.filter((c) => !c.archivedAt && c.id !== category?.id))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setErrors({ name: 'Required.' })
    const body = { name: name.trim(), slug: slug.trim() || undefined, description: description.trim() || null, parentId: parentId || null, status }
    const r = category ? await adminApi(`/api/admin/categories/${category.id}`, { method: 'PATCH', json: body }) : await adminApi('/api/admin/categories', { json: body })
    if (r.ok) onDone()
    else {
      setErrors(r.fields)
      setMessage(r.message)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {message && <Notice kind="error">{message}</Notice>}
      <div className="grid-2">
        <Field label="Name" error={errors.name}>
          <TextInput value={name} maxLength={120} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} />
        </Field>
        <Field label="Slug" error={errors.slug}>
          <TextInput value={slug} maxLength={120} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()) }} />
        </Field>
        <Field label="Inside" error={errors.parentId}>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">(top level)</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Status" error={errors.status}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </Field>
      </div>
      <Field label="Description" error={errors.description}>
        <TextArea rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn btn-dark" type="submit">{category ? 'Save' : 'Create category'}</button>
        <button className="btn btn-line" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
