// Thin, database-touching wrapper around nutritionResolution.ts's pure
// logic - this feature's equivalent of scanAnalysisService.ts. Not
// server-only: reads no secret itself, only takes an already-authenticated
// SupabaseClient (same reasoning as lib/outsidePlan/storage.ts).
//
// Fetches the active food_database catalog ONCE per call, regardless of
// how many items the vision result contains - resolving N detected items
// never costs more than one query (Question 24: avoid N+1).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'
import { resolveOutsidePlanNutrition, type ResolvedOutsidePlanNutrition } from './nutritionResolution'
import type { FoodCandidate } from './nutritionMatching'

// is_active filtered explicitly here rather than relying on food_database's
// RLS SELECT policy alone - that policy also allows inactive `supplement`
// category rows through (so a user can still see supplements they already
// added), which is the wrong behavior for fresh automated matching: a
// soft-deleted/test row (e.g. the catalog's own inactive "ggg" test food)
// must never be resurrected as a nutrition match just because RLS would
// technically allow reading it.
export async function fetchActiveFoodCandidates(supabase: SupabaseClient): Promise<FoodCandidate[]> {
  const { data, error } = await supabase
    .from('food_database')
    .select('id, name, category, serving_size, serving_unit, calories, protein, carbs, fat')
    .eq('is_active', true)

  if (error) {
    console.error('[outsidePlan/nutritionResolutionService] failed to fetch food_database candidates:', error.message)
    return []
  }

  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    category: row.category,
    serving_size: Number(row.serving_size),
    serving_unit: row.serving_unit,
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat)
  }))
}

export async function resolveOutsidePlanNutritionFromVision(supabase: SupabaseClient, visionResult: FoodAnalysisResult): Promise<ResolvedOutsidePlanNutrition> {
  const candidates = await fetchActiveFoodCandidates(supabase)
  return resolveOutsidePlanNutrition(visionResult, candidates)
}
