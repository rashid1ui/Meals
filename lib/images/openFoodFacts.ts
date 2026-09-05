import 'server-only'

// Server-only Open Food Facts client - the "trusted product/barcode
// database" step of supplement resolution (spec section 3b).
//
// OFF is a free, open database (no API key). We only ever REFERENCE the
// image URL OFF itself serves from its CDN - nothing is scraped, copied or
// rehosted. OFF product photos are licensed CC-BY-SA; we store that plus the
// product-page source_url so the UI can credit it and never implies Gym
// Meals owns the image. `import 'server-only'` keeps this out of the browser
// bundle; it is reached only from the create `after()` hook and the sweep.
//
// Uses OFF's "Search-a-licious" full-text API (search.openfoodfacts.org) -
// verified live during development to return accurate, image-bearing
// results for real product/supplement queries. The older
// world.openfoodfacts.org/cgi/search.pl endpoint was tried first but proved
// unreliable (observed returning empty results and even 503s live) - it's
// OFF's legacy interface; search-a-licious is OFF's current, actively
// maintained full-text search.

import type { ImageCandidate } from './types'

const OFF_LICENSE = 'CC-BY-SA 3.0'
// OFF asks API clients to send a descriptive User-Agent.
const USER_AGENT = 'GymMeals/1.0 (automatic supplement image resolution)'

type OffHit = {
  code?: string
  product_name?: string
  brands?: string[]
  categories_tags?: string[]
  image_url?: string
}

function productPageUrl(code: string): string {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`
}

// Returns provider-agnostic candidates from an OFF full-text product search,
// best match first (OFF's own relevance ranking), each carrying the OFF
// image URL, product page source_url and CC-BY-SA license. [] on any
// failure (missing/malformed response, non-200, network error, timeout).
export async function searchOpenFoodFacts(terms: string, pageSize = 8): Promise<ImageCandidate[]> {
  const query = terms.trim()
  if (!query) return []

  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}` +
    `&page_size=${pageSize}&fields=code,product_name,brands,categories_tags,image_url`

  let body: { hits?: OffHit[] }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) {
      console.warn(`[images/openfoodfacts] ${res.status} for "${query}"`)
      return []
    }
    body = (await res.json()) as { hits?: OffHit[] }
  } catch (err) {
    console.warn(`[images/openfoodfacts] request failed for "${query}":`, err instanceof Error ? err.message : err)
    return []
  }

  const out: ImageCandidate[] = []
  for (const hit of body.hits ?? []) {
    const image = (hit.image_url || '').trim()
    if (!image || !/^https:\/\//i.test(image)) continue
    const name = (hit.product_name || '').trim()
    out.push({
      url: image,
      alt: name || 'Product photo from Open Food Facts',
      haystack: `${(hit.brands ?? []).join(' ')} ${(hit.categories_tags ?? []).join(' ')} ${name}`.toLowerCase(),
      attribution: {
        source: 'openfoodfacts',
        source_url: hit.code ? productPageUrl(hit.code) : 'https://world.openfoodfacts.org',
        license: OFF_LICENSE
      }
    })
  }
  return out
}
