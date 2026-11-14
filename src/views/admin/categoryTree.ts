export type Cat = { id: string; name: string; slug: string; parentId: string | null; status: string; position: number; productCount: number; description: string | null; archivedAt: string | null; imageRef: string | null }

/** Orders categories as a tree (parents before children) and adds each one's depth. */
export function flattenTree<T extends { id: string; parentId: string | null }>(cats: T[]): (T & { depth: number })[] {
  const children = new Map<string | null, T[]>()
  for (const c of cats) {
    const key = c.parentId && cats.some((p) => p.id === c.parentId) ? c.parentId : null
    children.set(key, [...(children.get(key) ?? []), c])
  }
  const out: (T & { depth: number })[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of children.get(parent) ?? []) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
