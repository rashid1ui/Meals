// Meal-image resolution orchestration (resolve once -> store -> reuse).
//
// PURE of I/O: the Pexels search function is injected. The query is built
// from the meal's ACTUAL food composition + slot type (mealQuery.ts), never
// the bare label. Applies to every slot type identically. Low confidence ->
// null, and the meal keeps its emoji tile.

import { buildMealImageQuery, mealNoun, type MealFoodRef } from './mealQuery'
import { pickBest } from './score'
import type { CandidateSearch } from './resolveFood'
import type { ResolvedImage } from './types'

// A meal's food as the resolver needs it - identity, name and this food's
// calorie contribution so significant foods lead the query.
export type MealFoodContribution = MealFoodRef & {
  calories: number
}

export type MealImageInput = {
  name: string
}

export async function resolveMealImage(
  meal: MealImageInput,
  foods: readonly MealFoodContribution[],
  search: CandidateSearch
): Promise<ResolvedImage | null> {
  if (foods.length === 0) return null

  // Biggest calorie contributors first so the query leads with what the
  // meal actually is.
  const ordered = [...foods].sort((a, b) => b.calories - a.calories)
  const query = buildMealImageQuery(meal.name, ordered)
  const noun = mealNoun(meal.name, ordered)

  const candidates = await search(query)
  if (candidates.length === 0) return null

  const best = pickBest(candidates, query, noun)
  if (!best) return null

  const c = best.candidate
  return {
    url: c.url,
    alt: c.alt || `Photo representing ${meal.name}`,
    // A plated-meal stock photo is inherently representative, not the user's
    // exact plate.
    attribution: { ...c.attribution, is_representative: true },
    status: 'representative'
  }
}
