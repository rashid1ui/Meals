// Pure nutrition resolution for the AI Outside-Plan Food Scanner (Phase 4).
// Converts Kimi's visual identification (lib/ai-vision's FoodAnalysisResult
// - "what food appears in the photo?") into nutrition data resolved against
// this app's existing food_database (lib/nutrition's own territory - "how
// much nutrition does this food contain?"). No Supabase, no network - see
// nutritionResolutionService.ts for the thin DB-fetching wrapper.
//
// Deterministic macro math is NOT reimplemented here: calculateFoodMacros
// (lib/nutrition/calculator.ts), the exact function that already scales
// planned-meal nutrition by quantity/serving_size, is reused verbatim. This
// module's only new logic is (1) deciding whether a match is safe enough to
// trust at all (nutritionMatching.ts) and (2) validating/gating the weight
// Kimi estimated before ever calling that scaling function.

import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import { FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G } from './constants'
import { matchFoodCandidate, type FoodCandidate, type NutritionMatchTier } from './nutritionMatching'
import type { FoodAnalysisItem, FoodAnalysisResult } from '@/lib/ai-vision/types'

export type NutritionSource = 'food_database' | 'unresolved'

export interface ResolvedNutritionItem {
  originalName: string
  matchedFoodId: string | null
  matchedFoodName: string | null
  weightG: number | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  matchTier: NutritionMatchTier
  matchConfidence: number
  source: NutritionSource
  warnings: string[]
}

export interface ResolvedOutsidePlanNutrition {
  items: ResolvedNutritionItem[]
  // Deterministic sums of whatever items DID resolve - never a fabricated
  // "complete" total when some items are unresolved (Question 14: "safety
  // against false precision"). hasUnresolvedItems tells the caller (Phase
  // 5's review UI) whether this total is partial.
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number }
  hasUnresolvedItems: boolean
}

function isValidEstimatedWeight(weightG: number | null): weightG is number {
  // Defensive re-check, not a re-trust of upstream validation: Phase 3's
  // Zod schema (lib/ai-vision/schema.ts) already bounds this 0-3000 before
  // it ever reaches here, but this module never assumes an upstream
  // check is infallible (the whole feature's own stated principle).
  return typeof weightG === 'number' && isFinite(weightG) && weightG > 0 && weightG <= FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G
}

function toFoodMacro(candidate: FoodCandidate): FoodMacro {
  return {
    id: candidate.id,
    name: candidate.name,
    serving_size: candidate.serving_size,
    serving_unit: candidate.serving_unit,
    calories: candidate.calories,
    protein: candidate.protein,
    carbs: candidate.carbs,
    fat: candidate.fat
  }
}

// Resolves ONE Kimi-detected item against the candidate catalog. Kimi's own
// estimate is used only for identity (item.name) and portion (item.
// estimatedWeightG) - never for calories/protein/carbs/fat, which always
// come from calculateFoodMacros against a matched food_database row, or
// are left null when no safe match/weight exists (never fabricated).
export function resolveNutritionForItem(item: FoodAnalysisItem, candidates: readonly FoodCandidate[]): ResolvedNutritionItem {
  const match = matchFoodCandidate(item.name, candidates)
  const warnings = [...match.warnings]

  if (!match.candidate) {
    // No safe nutrition match (Question 6/11): this is NOT a failure of
    // the scan - the item was identified, it just doesn't have a
    // trustworthy nutrition basis yet. Weight is still surfaced (Kimi's
    // own estimate, if any) so Phase 5 can show it even while nutrition
    // awaits manual entry - never inventing calories to fill the gap.
    return {
      originalName: item.name,
      matchedFoodId: null,
      matchedFoodName: null,
      weightG: isValidEstimatedWeight(item.estimatedWeightG) ? item.estimatedWeightG : null,
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      matchTier: match.tier,
      matchConfidence: match.confidence,
      source: 'unresolved',
      warnings
    }
  }

  if (!isValidEstimatedWeight(item.estimatedWeightG)) {
    // A safe food match exists, but with no reliable weight there is
    // nothing to scale it by - inventing a default weight here is exactly
    // the "false precision" this feature must avoid (Question 7: "do not
    // invent an exact weight... allow the Review UI to ask the user").
    return {
      originalName: item.name,
      matchedFoodId: match.candidate.id,
      matchedFoodName: match.candidate.name,
      weightG: null,
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      matchTier: match.tier,
      matchConfidence: match.confidence,
      source: 'food_database',
      warnings: [...warnings, 'No reliable weight estimate was available - enter a weight to calculate nutrition.']
    }
  }

  const calculated = calculateFoodMacros(item.estimatedWeightG, toFoodMacro(match.candidate))

  return {
    originalName: item.name,
    matchedFoodId: match.candidate.id,
    matchedFoodName: match.candidate.name,
    weightG: item.estimatedWeightG,
    calories: calculated.calories,
    proteinG: calculated.protein,
    carbsG: calculated.carbs,
    fatG: calculated.fat,
    matchTier: match.tier,
    matchConfidence: match.confidence,
    source: 'food_database',
    warnings
  }
}

// Resolves every item in a Kimi vision result and aggregates totals.
// Deliberately synchronous/pure - the candidate catalog is fetched once by
// the caller (nutritionResolutionService.ts) so resolving N items never
// costs more than one query total (Question 24: "avoid N+1").
export function resolveOutsidePlanNutrition(visionResult: FoodAnalysisResult, candidates: readonly FoodCandidate[]): ResolvedOutsidePlanNutrition {
  const items = visionResult.items.map(item => resolveNutritionForItem(item, candidates))

  let calories = 0
  let proteinG = 0
  let carbsG = 0
  let fatG = 0
  let hasUnresolvedItems = false

  for (const item of items) {
    if (item.calories === null) {
      hasUnresolvedItems = true
      continue
    }
    // Sum raw, unrounded values - matches lib/nutrition/calculator.ts's
    // own calculateDiet convention of accumulating full-precision numbers
    // and never rounding intermediate results, so aggregate totals don't
    // drift from repeated rounding.
    calories += item.calories
    proteinG += item.proteinG ?? 0
    carbsG += item.carbsG ?? 0
    fatG += item.fatG ?? 0
  }

  return { items, totals: { calories, proteinG, carbsG, fatG }, hasUnresolvedItems }
}
