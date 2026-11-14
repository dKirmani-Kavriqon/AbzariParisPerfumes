import type { ProductDetails } from '../../server/db/schema/catalog'

type Notes = NonNullable<ProductDetails['notes']>

/** "Top: Woody, Balsamic" lines → notes tiers. Blank lines are ignored; a line without "Tier:" is an error. */
export function parseNotesText(text: string): { ok: true; notes: Notes } | { ok: false; line: number } {
  const notes: Notes = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const m = /^([^:]{1,20}):\s*(.+)$/.exec(line)
    if (!m) return { ok: false, line: i + 1 }
    const items = m[2].split(',').map((s) => s.trim()).filter(Boolean)
    if (!items.length) return { ok: false, line: i + 1 }
    notes.push({ tier: m[1].trim(), notes: items })
  }
  return { ok: true, notes }
}

export function notesToText(notes: Notes | undefined) {
  return (notes ?? []).map((t) => `${t.tier}: ${t.notes.join(', ')}`).join('\n')
}
