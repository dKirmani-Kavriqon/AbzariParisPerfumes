/*
 * Runs after `opennextjs-cloudflare build`. Copies the pre-rendered 404 page out of OpenNext's cache
 * into .open-next/not-found.html, which worker.ts bundles as text. The Worker can then answer
 * "this page does not exist" (archived products, hidden admin) without running Next.js:
 * about 1 ms of CPU instead of 8–16 ms, well inside the free plan's 10 ms.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function find(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      const hit = find(p, name)
      if (hit) return hit
    } else if (entry === name) return p
  }
  return undefined
}

const source = find('.open-next/cache', '_not-found.cache')
if (!source) throw new Error('Pre-rendered 404 page not found in .open-next/cache. Did `opennextjs-cloudflare build` run?')
const { html } = JSON.parse(readFileSync(source, 'utf8')) as { html?: string }
if (!html || !html.startsWith('<!DOCTYPE html>')) throw new Error(`Unexpected 404 cache entry: ${source}`)
writeFileSync('.open-next/not-found.html', html)
console.log(`404 page: .open-next/not-found.html (${html.length} bytes)`)
