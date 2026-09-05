/**
 * assign-food-images.ts - one-off / rerunnable image assignment.
 *
 * Resolves a real, specific food photo for every ACTIVE food_database row via
 * the Pexels API and stores the CDN URL + alt text + attribution on the row.
 * The running app NEVER calls Pexels - FoodRow / FoodPickerModal only ever
 * read the stored food_database.image_url (see components/food/FoodThumb.tsx).
 *
 * Strategy (the database name is the source of truth):
 *   name -> buildFoodImageQuery (drops only nutrition-basis noise, keeps
 *           raw/cooked/grilled/cut/variety/... - see lib/food/foodImageQuery.ts)
 *   -> Pexels search, top 15 candidates
 *   -> score each candidate: the primary food noun MUST appear in the
 *      photo's alt/slug, plus query-token coverage, minus scene/wrong-food
 *      penalties
 *   -> confidence tier HIGH / MEDIUM / LOW
 *   -> HIGH + MEDIUM are stored; LOW is FLAGGED and left on the emoji
 *      fallback (never a wrong image just to reach full coverage)
 * Every food is logged with its exact query, chosen photo, and score.
 *
 * Usage:
 *   PEXELS_API_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
 *     npm run assign-food-images            # only rows missing an image
 *     npm run assign-food-images -- --force # re-resolve every active row
 *     npm run assign-food-images -- --dry   # log choices, write nothing
 * Env is also read from .env.local if present (dotenv, best-effort).
 *
 * Pexels attribution: their guidelines require crediting the photographer
 * and linking back. We store photographer + photographer_url + the photo's
 * Pexels page; the UI surfaces "Food photos via Pexels" and a per-image
 * photographer credit.
 */
import { createClient } from '@supabase/supabase-js'
import { buildFoodImageQuery, primaryFoodNoun } from '../lib/food/foodImageQuery'
import { queryTokens, scoreCandidate as scoreImageCandidate, type ScoredCandidate } from '../lib/images/score'
import type { ImageCandidate } from '../lib/images/types'

type PexelsPhoto = {
  id: number
  url: string
  alt: string | null
  photographer: string
  photographer_url: string
  src: Record<string, string>
}

async function loadDotEnvLocal(): Promise<void> {
  try {
    const dotenv = await import('dotenv')
    dotenv.config({ path: '.env.local' })
    dotenv.config({ path: '.env' })
  } catch {
    // no dotenv / no file - rely on inline env
  }
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

function squareUrl(photo: PexelsPhoto): string {
  const base = photo.src.large2x || photo.src.large || photo.src.original
  return base.split('?')[0] + '?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600'
}

// Scoring / tiering logic lives in lib/images/score.ts now (shared with the
// runtime resolver). This adapter just maps a PexelsPhoto to the provider-
// agnostic ImageCandidate that scorer expects - identical ranking as before.
function toCandidate(photo: PexelsPhoto): ImageCandidate {
  let slug = ''
  try { slug = new URL(photo.url).pathname } catch { /* keep '' */ }
  return {
    url: photo.url,
    alt: photo.alt ?? '',
    haystack: slug,
    attribution: {
      source: 'pexels',
      photographer: photo.photographer,
      photographer_url: photo.photographer_url,
      source_url: photo.url
    }
  }
}

type Scored = ScoredCandidate & { photo: PexelsPhoto }

function scoreCandidate(photo: PexelsPhoto, tokens: string[], noun: string): Scored {
  return { ...scoreImageCandidate(toCandidate(photo), tokens, noun), photo }
}

async function searchPexels(apiKey: string, query: string): Promise<PexelsPhoto[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&size=medium`
  const res = await fetch(url, { headers: { Authorization: apiKey } })
  if (!res.ok) {
    console.warn(`  ! Pexels ${res.status} for "${query}"`)
    return []
  }
  const body = (await res.json()) as { photos?: PexelsPhoto[] }
  return body.photos ?? []
}

async function main() {
  await loadDotEnvLocal()

  const force = process.argv.includes('--force')
  const dryRun = process.argv.includes('--dry')

  const PEXELS_API_KEY = process.env.PEXELS_API_KEY
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!PEXELS_API_KEY) {
    console.error('ERROR: PEXELS_API_KEY is not set. Get a free key at https://www.pexels.com/api/')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  let sel = supabase.from('food_database').select('id, name, image_url').eq('is_active', true).order('name')
  if (!force) sel = sel.is('image_url', null)
  const { data: foods, error } = await sel
  if (error) {
    console.error('ERROR: failed to load food_database:', error.message)
    process.exit(1)
  }
  if (!foods || foods.length === 0) {
    console.log('Nothing to do - every active food already has an image (use --force to re-resolve).')
    return
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Resolving images for ${foods.length} food(s)...\n`)
  let high = 0, medium = 0, flagged = 0

  for (const food of foods as { id: string; name: string }[]) {
    const query = buildFoodImageQuery(food.name)
    const noun = primaryFoodNoun(food.name)
    const qTokens = queryTokens(query)

    let photos: PexelsPhoto[] = []
    try {
      photos = await searchPexels(PEXELS_API_KEY, query)
    } catch (e) {
      console.warn(`  ! network error for "${food.name}":`, (e as Error).message)
    }

    const ranked = photos
      .map(p => scoreCandidate(p, qTokens, noun))
      .sort((a, b) => b.score - a.score)
    const best = ranked[0]

    if (!best || best.tier === 'LOW') {
      flagged++
      console.log(
        `FLAG   ${food.name}\n` +
          `       query: "${query}"  (noun: "${noun}")\n` +
          `       ${best ? `best #${best.photo.id} tier=LOW score=${best.score} cov=${best.coverage} noun=${best.nounHit} neg=${best.neg}` : 'no results'}\n` +
          `       -> not stored; food keeps the emoji fallback\n`
      )
      if (force && !dryRun) {
        await supabase
          .from('food_database')
          .update({ image_url: null, image_alt: null, image_attribution: null })
          .eq('id', food.id)
      }
      await sleep(280)
      continue
    }

    if (best.tier === 'HIGH') high++
    else medium++

    const p = best.photo
    const image_url = squareUrl(p)
    const image_alt = (p.alt && p.alt.trim()) || `Photo of ${food.name}`
    const image_attribution = {
      source: 'pexels',
      photographer: p.photographer,
      photographer_url: p.photographer_url,
      source_url: p.url
    }

    console.log(
      `${best.tier.padEnd(6)} ${food.name}\n` +
        `       query: "${query}"\n` +
        `       photo: #${p.id}  "${(p.alt ?? '').slice(0, 66)}"  by ${p.photographer}\n` +
        `       score ${best.score}  coverage ${best.coverage}\n`
    )

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from('food_database')
        .update({ image_url, image_alt, image_attribution })
        .eq('id', food.id)
      if (upErr) console.warn(`  ! failed to store image for "${food.name}":`, upErr.message)
    }
    await sleep(280) // gentle on the Pexels rate limit (200 req/hr free tier)
  }

  console.log(`\nDone.  HIGH ${high}   MEDIUM ${medium}   FLAGGED ${flagged}   (of ${foods.length})`)
  if (flagged > 0) console.log('Flagged foods were left on the emoji fallback - refine their query in lib/food/foodImageQuery.ts and re-run.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
