// Food-image resolution orchestration (normal foods).
//
// PURE of I/O: the Pexels search function is injected, so this is unit-
// tested directly with a fake. lib/images/runResolve.ts binds the real
// server-only client. The database name is the source of truth - query
// building reuses the EXISTING, unchanged lib/food/foodImageQuery.ts.

import { buildFoodImageQuery, primaryFoodNoun } from '@/lib/food/foodImageQuery'
import { pickBest } from './score'
import type { ImageCandidate, ResolvedImage } from './types'

export type CandidateSearch = (query: string) => Promise<ImageCandidate[]>

export type FoodImageInput = {
  name: string
}

// Returns a confident (HIGH/MEDIUM) match, or null when nothing scored above
// LOW - the caller then persists status='unresolved' and the food keeps its
// emoji tile. Never returns candidates[0] blindly (see score.ts).
export async function resolveFoodImage(
  food: FoodImageInput,
  search: CandidateSearch
): Promise<ResolvedImage | null> {
  const query = buildFoodImageQuery(food.name)
  const noun = primaryFoodNoun(food.name)

  const candidates = await search(query)
  if (candidates.length === 0) return null

  const best = pickBest(candidates, query, noun)
  if (!best) return null

  const c = best.candidate
  return {
    url: c.url,
    alt: c.alt || `Photo of ${food.name}`,
    attribution: c.attribution,
    status: 'resolved'
  }
}
