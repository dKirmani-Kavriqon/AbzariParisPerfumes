/** Public URL of a catalogue image. Static images ship with the site; uploaded ones are served from /media. */
export function catalogImageUrl(source: 'static' | 'object' | string, storageKey: string) {
  return source === 'object' ? `/media/${storageKey}` : storageKey
}

/** Parses the "source:key" summary used in product lists. */
export function parseImageRef(ref: string | null) {
  if (!ref) return null
  const i = ref.indexOf(':')
  return i < 0 ? null : catalogImageUrl(ref.slice(0, i), ref.slice(i + 1))
}
