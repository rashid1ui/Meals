// Pure, framework-free resolution of a food's stored photo into what the UI
// needs to render it - no Supabase, no network, no React. Importable by
// tests and by client components alike.
//
// The golden rule: this NEVER fabricates or guesses a URL. It only ever
// hands back a URL that was already stored on the food_database row by
// scripts/assign-food-images.ts. When there is nothing usable it returns
// null and the caller falls back to the deterministic emoji/tile treatment.

export type FoodImageAttribution = {
  // Provider id, e.g. 'pexels'. Lowercase.
  source?: string | null
  photographer?: string | null
  photographer_url?: string | null
  // Canonical page for the photo on the provider's site.
  source_url?: string | null
}

// The three columns added in migration 0029. All optional / nullable so any
// food object (a full FoodOption, a partial row, undefined) can be passed.
export type FoodImageFields = {
  image_url?: string | null
  image_alt?: string | null
  image_attribution?: FoodImageAttribution | null
}

export type ResolvedFoodImage = {
  src: string
  alt: string
  // Short human credit line, e.g. "Photo: Jane Doe / Pexels". null when no
  // attribution metadata was stored.
  credit: string | null
  // Best link to honour the provider's attribution requirement (photographer
  // page, else the photo's page). null when neither was stored.
  creditUrl: string | null
}

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

// Returns null when there is no usable stored image (missing, blank, or not
// an https URL) - the caller shows the deterministic fallback. Only https is
// accepted so a malformed/relative value can never become an <img src>.
export function resolveFoodImage(
  food: FoodImageFields | null | undefined,
  foodName: string
): ResolvedFoodImage | null {
  const url = food?.image_url?.trim()
  if (!url || !/^https:\/\//i.test(url)) return null

  const attribution = food?.image_attribution ?? null
  const photographer = attribution?.photographer?.trim() || null
  const sourceLabel = attribution?.source?.trim() ? titleCase(attribution.source.trim()) : null

  const credit = photographer && sourceLabel
    ? `Photo: ${photographer} / ${sourceLabel}`
    : sourceLabel
      ? `Photo via ${sourceLabel}`
      : photographer
        ? `Photo: ${photographer}`
        : null

  const creditUrl =
    attribution?.photographer_url?.trim() || attribution?.source_url?.trim() || null

  return {
    src: url,
    alt: food?.image_alt?.trim() || `Photo of ${foodName}`,
    credit,
    creditUrl: creditUrl && /^https:\/\//i.test(creditUrl) ? creditUrl : null
  }
}

// True when at least one food in the list has a usable stored image - lets a
// list view show a single provider credit line ("Photos via Pexels") only
// when it is actually showing provider photos.
export function anyFoodHasImage(foods: readonly (FoodImageFields | null | undefined)[]): boolean {
  return foods.some(f => {
    const url = f?.image_url?.trim()
    return Boolean(url && /^https:\/\//i.test(url))
  })
}
