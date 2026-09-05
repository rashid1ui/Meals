// Pure, framework-free resolution of a stored photo (food / meal /
// supplement) into what the UI needs to render it - no Supabase, no
// network, no React. Importable by tests and by client components alike.
//
// The golden rule: this NEVER fabricates or guesses a URL. It only ever
// hands back a URL that was already stored on the row by the image
// resolver (lib/images/*). When there is nothing usable it returns null and
// the caller falls back to the deterministic emoji/icon treatment.

export type FoodImageAttribution = {
  // Provider id, lowercase: 'pexels' | 'openfoodfacts'.
  source?: string | null
  photographer?: string | null
  photographer_url?: string | null
  // Canonical page for the photo / product on the provider's site.
  source_url?: string | null
  // e.g. 'CC-BY-SA 3.0' for Open Food Facts product photos.
  license?: string | null
  // true when the image is a category / stock stand-in, not the exact item.
  is_representative?: boolean
}

// image_url / image_alt / image_attribution. All optional / nullable so any
// row object (a full FoodOption, a partial meal row, undefined) can be passed.
export type FoodImageFields = {
  image_url?: string | null
  image_alt?: string | null
  image_attribution?: FoodImageAttribution | null
}

export type ResolvedFoodImage = {
  src: string
  alt: string
  // Short human credit line, e.g. "Photo: Jane Doe / Pexels" or
  // "Photo via Open Food Facts". null when no attribution metadata was stored.
  credit: string | null
  // Best link to honour the provider's attribution requirement (photographer
  // page, else the photo's / product's page). null when neither was stored.
  creditUrl: string | null
  // true when this is a representative stand-in, not the exact item - the
  // caller may surface a subtle "representative image" hint.
  isRepresentative: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  pexels: 'Pexels',
  openfoodfacts: 'Open Food Facts'
}

function sourceLabel(source: string): string {
  const key = source.toLowerCase()
  return SOURCE_LABELS[key] ?? (source.length ? source[0].toUpperCase() + source.slice(1) : source)
}

// Generic reader. Returns null when there is no usable stored image
// (missing, blank, or not an https URL) - the caller shows the
// deterministic fallback. Only https is accepted so a malformed/relative
// value can never become an <img src>.
export function resolveStoredImage(
  row: FoodImageFields | null | undefined,
  fallbackAlt: string
): ResolvedFoodImage | null {
  const url = row?.image_url?.trim()
  if (!url || !/^https:\/\//i.test(url)) return null

  const attribution = row?.image_attribution ?? null
  const photographer = attribution?.photographer?.trim() || null
  const label = attribution?.source?.trim() ? sourceLabel(attribution.source.trim()) : null

  const credit = photographer && label
    ? `Photo: ${photographer} / ${label}`
    : label
      ? `Photo via ${label}`
      : photographer
        ? `Photo: ${photographer}`
        : null

  const creditUrl =
    attribution?.photographer_url?.trim() || attribution?.source_url?.trim() || null

  return {
    src: url,
    alt: row?.image_alt?.trim() || fallbackAlt,
    credit,
    creditUrl: creditUrl && /^https:\/\//i.test(creditUrl) ? creditUrl : null,
    isRepresentative: attribution?.is_representative === true
  }
}

// Back-compat wrapper for food rows - unchanged output shape for existing
// callers (FoodThumb / FoodPickerModal) and tests.
export function resolveFoodImage(
  food: FoodImageFields | null | undefined,
  foodName: string
): ResolvedFoodImage | null {
  return resolveStoredImage(food, `Photo of ${foodName}`)
}

// True when at least one row in the list has a usable stored image - lets a
// list view show a single provider credit line only when it is actually
// showing provider photos.
export function anyFoodHasImage(foods: readonly (FoodImageFields | null | undefined)[]): boolean {
  return foods.some(f => {
    const url = f?.image_url?.trim()
    return Boolean(url && /^https:\/\//i.test(url))
  })
}
