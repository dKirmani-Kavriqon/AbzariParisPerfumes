/** Lowercase words joined by single hyphens: "rawah", "eau-de-parfum". */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLUG_MAX = 120

/** Builds a slug from a name: "Élan Noir (50 ml)" → "elan-noir-50-ml". */
export function slugify(input: string) {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
}
