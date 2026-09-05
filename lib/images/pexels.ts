import 'server-only'

// Server-only Pexels client for runtime image resolution.
//
// `import 'server-only'` makes it a BUILD ERROR to pull this into a client
// bundle - the browser never sees PEXELS_API_KEY and never calls Pexels.
// The running app only ever reads already-stored image_url columns; this
// module is reached exclusively from the `after()` create hooks and the
// /api/cron/images sweep, never from render.

import type { ImageCandidate } from './types'

type PexelsPhoto = {
  id: number
  url: string
  alt: string | null
  photographer: string
  photographer_url: string
  src: Record<string, string>
}

export function pexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY)
}

// Normalise a Pexels photo to a stored, square, compressed CDN URL - same
// transform scripts/assign-food-images.ts has always used.
function squareUrl(photo: PexelsPhoto): string {
  const base = photo.src.large2x || photo.src.large || photo.src.original || photo.url
  return base.split('?')[0] + '?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600'
}

// Returns up to `perPage` provider-agnostic candidates for `query`, or [] on
// any failure (missing key, non-200, network error) - resolution then falls
// back / leaves the row unresolved, never throws into the caller.
export async function searchPexels(query: string, perPage = 15): Promise<ImageCandidate[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&size=medium`

  let body: { photos?: PexelsPhoto[] }
  try {
    const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      console.warn(`[images/pexels] ${res.status} for "${query}"`)
      return []
    }
    body = (await res.json()) as { photos?: PexelsPhoto[] }
  } catch (err) {
    console.warn(`[images/pexels] request failed for "${query}":`, err instanceof Error ? err.message : err)
    return []
  }

  return (body.photos ?? []).map(p => {
    let slug = ''
    try {
      slug = new URL(p.url).pathname
    } catch {
      /* keep '' */
    }
    return {
      url: squareUrl(p),
      alt: (p.alt && p.alt.trim()) || '',
      haystack: slug,
      attribution: {
        source: 'pexels',
        photographer: p.photographer,
        photographer_url: p.photographer_url,
        source_url: p.url
      }
    } satisfies ImageCandidate
  })
}
