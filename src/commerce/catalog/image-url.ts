/** Public URL of a catalogue image. Static images ship with the site; uploaded ones are served from /media. */
export function catalogImageUrl(source: 'static' | 'object' | string, storageKey: string) {
  return source === 'object' ? `/media/${storageKey}` : storageKey
}

/**
 * URL of an image for the admin screens. Uploaded images go through the admin-only media route,
 * because /media only serves images of products that are live in the shop.
 */
export function adminImageUrl(source: 'static' | 'object' | string, storageKey: string) {
  return source === 'object' ? `/api/admin/media/${storageKey}` : storageKey
}

/** Parses the "source:key" summary used in admin product lists. */
export function parseImageRef(ref: string | null) {
  if (!ref) return null
  const i = ref.indexOf(':')
  return i < 0 ? null : adminImageUrl(ref.slice(0, i), ref.slice(i + 1))
}
