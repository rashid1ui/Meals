// Browser-side review state for the Outside-Plan Food Scanner (Phase 5).
// Pure, client-safe helpers - no Supabase, no server imports. The confirm
// SERVER re-validates and re-derives everything here (lib/outsidePlan/
// reviewModel.ts); this module only drives the live editing UI.
//
// Weight -> macro recompute for a database-matched item reuses
// calculateFoodMacros (lib/nutrition/calculator.ts) - the SAME deterministic
// scaling the rest of the app uses - never a second formula, and never a
// re-call to the vision model (Phase 5 section 10).

import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import { FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G } from '@/lib/outsidePlan/constants'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'
import type { ResolvedOutsidePlanNutrition } from '@/lib/outsidePlan/nutritionResolution'
import type { ConfirmItemInput } from '@/lib/outsidePlan/reviewModel'

export type ReviewItemSource = 'matched' | 'manual'

export interface ReviewItem {
  clientId: string
  name: string
  // From the AI analysis (true) vs. hand-added in the review screen (false).
  detected: boolean
  originalName: string | null
  aiConfidence: number | null
  // AI's own words - display only, never used in any calculation.
  portionText: string | null
  aiNotes: string | null
  source: ReviewItemSource
  matchedFoodId: string | null
  matchedFoodName: string | null
  // 'high' | 'medium' for a trusted match; 'manual' once the user takes
  // over the numbers; 'added' for a hand-added item.
  tierLabel: 'high' | 'medium' | 'manual' | 'added'
  weightG: number | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  warnings: string[]
}

let counter = 0
function nextId(): string {
  counter += 1
  return `ri_${Date.now().toString(36)}_${counter}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function isValidWeight(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G
}

// True when this item cannot be confirmed yet: a matched item with no
// weight (nothing to scale) or no computed calories, or a manual item
// missing any of the four macros. Drives the unresolved-item guard
// (Phase 5 section 17) - the UI never fabricates a value to clear this.
export function itemNeedsNutrition(item: ReviewItem): boolean {
  if (!item.name.trim()) return true
  if (item.source === 'matched') {
    return !isValidWeight(item.weightG) || item.calories === null
  }
  return (
    item.calories === null ||
    item.protein === null ||
    item.carbs === null ||
    item.fat === null ||
    item.calories < 0 ||
    item.protein < 0 ||
    item.carbs < 0 ||
    item.fat < 0
  )
}

// Recompute a matched item's four macros from its food_database basis and a
// new weight. Deterministic; no network.
export function recalcMatchedItem(item: ReviewItem, basis: FoodMacro, weightG: number | null): ReviewItem {
  if (!isValidWeight(weightG)) {
    return { ...item, weightG, calories: null, protein: null, carbs: null, fat: null }
  }
  const scaled = calculateFoodMacros(weightG, basis)
  return {
    ...item,
    weightG,
    calories: round1(scaled.calories),
    protein: round1(scaled.protein),
    carbs: round1(scaled.carbs),
    fat: round1(scaled.fat)
  }
}

// Detach a matched item from the catalog and let the user own the numbers
// (keeps the current values as the editable starting point).
export function toManualItem(item: ReviewItem): ReviewItem {
  return {
    ...item,
    source: 'manual',
    matchedFoodId: null,
    matchedFoodName: null,
    tierLabel: item.detected ? 'manual' : 'added',
    warnings: []
  }
}

export function newManualItem(): ReviewItem {
  return {
    clientId: nextId(),
    name: '',
    detected: false,
    originalName: null,
    aiConfidence: null,
    portionText: null,
    aiNotes: null,
    source: 'manual',
    matchedFoodId: null,
    matchedFoodName: null,
    tierLabel: 'added',
    weightG: null,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    warnings: []
  }
}

// Turns the analyze response into the initial editable list. resolved.items
// is 1:1 with analysis.items (Phase 4 guarantee).
export function buildReviewItems(analysis: FoodAnalysisResult, resolved: ResolvedOutsidePlanNutrition): ReviewItem[] {
  return resolved.items.map((r, i) => {
    const ai = analysis.items[i]
    const trusted = r.source === 'food_database' && Boolean(r.matchedFoodId)
    return {
      clientId: nextId(),
      name: r.originalName || ai?.name || 'Food item',
      detected: true,
      originalName: r.originalName || ai?.name || null,
      aiConfidence: ai?.confidence ?? null,
      portionText: ai?.estimatedPortionDescription ?? null,
      aiNotes: ai?.notes ?? null,
      source: trusted ? 'matched' : 'manual',
      matchedFoodId: trusted ? r.matchedFoodId : null,
      matchedFoodName: trusted ? r.matchedFoodName : null,
      tierLabel: trusted ? (r.matchTier === 'high' ? 'high' : 'medium') : 'manual',
      weightG: r.weightG ?? ai?.estimatedWeightG ?? null,
      calories: r.calories,
      protein: r.proteinG,
      carbs: r.carbsG,
      fat: r.fatG,
      warnings: r.warnings ?? []
    }
  })
}

export function sumReviewTotals(items: ReviewItem[]): { calories: number; protein: number; carbs: number; fat: number } {
  return items.reduce(
    (acc, i) => ({
      calories: acc.calories + (i.calories ?? 0),
      protein: acc.protein + (i.protein ?? 0),
      carbs: acc.carbs + (i.carbs ?? 0),
      fat: acc.fat + (i.fat ?? 0)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

// Shape the list for the confirm Server Action. The server ignores
// client-sent macros for a 'matched' item and recomputes them; they are
// still sent so an offline-degraded server response is comparable.
export function toConfirmItems(items: ReviewItem[]): ConfirmItemInput[] {
  return items.map(i => ({
    clientId: i.clientId,
    name: i.name.trim(),
    source: i.source,
    matchedFoodId: i.matchedFoodId,
    weightG: i.weightG,
    calories: i.calories,
    protein: i.protein,
    carbs: i.carbs,
    fat: i.fat,
    detected: i.detected,
    originalName: i.originalName,
    aiConfidence: i.aiConfidence
  }))
}
