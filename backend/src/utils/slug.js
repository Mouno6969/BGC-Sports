// ---------------------------------------------------------------------------
// slugify — derive a stable URL slug from a channel name.
// Must stay in sync with frontend/src/lib/slug.js so deep links resolve
// identically on both sides.
//   "beIN Sports 1"  -> "bein-sports-1"
//   "T Sports (BD)"  -> "t-sports-bd"
// ---------------------------------------------------------------------------

export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-'); // collapse repeats
}
