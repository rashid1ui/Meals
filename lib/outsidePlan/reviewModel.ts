// Pure review/confirm logic for the AI Outside-Plan Food Scanner (Phase 5).
// No Supabase, no React, no 'server-only' - same pure/glue split this
// feature already uses (nutritionResolution.ts pure vs.
// nutritionResolutionService.ts DB glue; scanAnalysis.ts pure vs.
// scanAnalysisService.ts glue). Everything here is unit-testable with plain
// objects.
//
// This module is the trust boundary for CONFIRM: the review screen sends
// back a list of items the user edited, and none of it can be believed. For
// a database-matched item the server recomputes macros from food_database +
// the reviewed weight (client-sent calories/macros are ignored); for a
// manually-entered item the four macros are the user's own confirmed values
// but must still pass the same numeric bounds the
// outside_plan_food_entries CHECK constraints (migration 0031) enforce, so
// a bad value is a clean validation error rather than a failed INSERT.

import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import { FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G } from './constants'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'
import type { MacroTotals } from '@/lib/tracking/logic'

// The outside_plan_food_entries column CHECK bounds (migration 0031). Kept
// here as named constants so the review layer rejects an out-of-range value
// with a specific message instead of letting the INSERT fail generically.
export const OUTSIDE_PLAN_MAX_CALORIES = 5000
export const OUTSIDE_PLAN_MAX_MACRO_G = 500

export type ReviewItemSource = 'matched' | 'manual'

// One item as the review screen sends it back at confirm time. Untrusted -
// every field is re-validated / re-derived below.
export interface ConfirmItemInput {
  clientId: string
  name: string
  source: ReviewItemSource
  // Required (and must resolve against the freshly-fetched active catalog)
  // when source === 'matched'. Ignored otherwise.
  matchedFoodId: string | null
  // Grams. Required for a 'matched' item (nothing to scale without it);
  // optional context for a 'manual' item.
  weightG: number | null
  // Only read for a 'manual' item. For a 'matched' item these are recomputed
  // server-side and whatever the client sent is discarded.
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  // True if this item came from the AI analysis (vs. added by hand in the
  // review screen). Drives was_edited and the components audit record.
  detected: boolean
  originalName: string | null
  aiConfidence: number | null
}

export interface ValidatedReviewItem {
  name: string
  source: ReviewItemSource
  matchedFoodId: string | null
  matchedFoodName: string | null
  weightG: number | null
  calories: number
  protein: number
  carbs: number
  fat: number
  detected: boolean
  originalName: string | null
  aiConfidence: number | null
}

export type ValidateConfirmItemsResult =
  | { ok: true; items: ValidatedReviewItem[] }
  | { ok: false; invalid: { clientId: string; reason: string }[] }

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isValidWeight(v: number | null): v is number {
  return isFiniteNumber(v) && v > 0 && v <= FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function boundsError(name: string, calories: number, protein: number, carbs: number, fat: number): string | null {
  if (calories > OUTSIDE_PLAN_MAX_CALORIES) return `"${name}" is over ${OUTSIDE_PLAN_MAX_CALORIES} kcal - split it into two items.`
  if (protein > OUTSIDE_PLAN_MAX_MACRO_G || carbs > OUTSIDE_PLAN_MAX_MACRO_G || fat > OUTSIDE_PLAN_MAX_MACRO_G) {
    return `"${name}" has a macro over ${OUTSIDE_PLAN_MAX_MACRO_G} g - check the values.`
  }
  return null
}

// candidatesById is the freshly-fetched active food_database
// (nutritionResolutionService.ts's fetchActiveFoodCandidates), keyed by id.
// A 'matched' item whose id is not in this map is rejected - a catalog row
// that was deactivated between analysis and confirm must not silently apply
// stale nutrition.
export function validateConfirmItems(
  rawItems: ConfirmItemInput[],
  candidatesById: ReadonlyMap<string, FoodMacro>
): ValidateConfirmItemsResult {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, invalid: [{ clientId: '*', reason: 'Add at least one food item before confirming.' }] }
  }

  const invalid: { clientId: string; reason: string }[] = []
  const items: ValidatedReviewItem[] = []

  for (const raw of rawItems) {
    const clientId = typeof raw?.clientId === 'string' ? raw.clientId : '*'
    const name = typeof raw?.name === 'string' ? raw.name.trim() : ''

    if (!name) {
      invalid.push({ clientId, reason: 'Every item needs a name.' })
      continue
    }
    if (name.length > 200) {
      invalid.push({ clientId, reason: `"${name.slice(0, 20)}…" name is too long.` })
      continue
    }

    if (raw.source === 'matched') {
      const candidate = raw.matchedFoodId ? candidatesById.get(raw.matchedFoodId) : undefined
      if (!candidate) {
        invalid.push({ clientId, reason: `"${name}" is no longer linked to a food in our database - enter its nutrition manually.` })
        continue
      }
      if (!isValidWeight(raw.weightG)) {
        invalid.push({ clientId, reason: `Enter a weight (1-${FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G} g) for "${name}".` })
        continue
      }
      const scaled = calculateFoodMacros(raw.weightG, candidate)
      const calories = round1(scaled.calories)
      const protein = round1(scaled.protein)
      const carbs = round1(scaled.carbs)
      const fat = round1(scaled.fat)
      const bound = boundsError(name, calories, protein, carbs, fat)
      if (bound) {
        invalid.push({ clientId, reason: bound })
        continue
      }
      items.push({
        name,
        source: 'matched',
        matchedFoodId: candidate.id,
        matchedFoodName: candidate.name,
        weightG: raw.weightG,
        calories,
        protein,
        carbs,
        fat,
        detected: Boolean(raw.detected),
        originalName: raw.originalName ?? null,
        aiConfidence: isFiniteNumber(raw.aiConfidence) ? raw.aiConfidence : null
      })
      continue
    }

    // source === 'manual'
    const macros = [raw.calories, raw.protein, raw.carbs, raw.fat]
    if (!macros.every(isFiniteNumber) || macros.some(m => (m as number) < 0)) {
      invalid.push({ clientId, reason: `Enter calories, protein, carbs and fat for "${name}".` })
      continue
    }
    const calories = round1(raw.calories as number)
    const protein = round1(raw.protein as number)
    const carbs = round1(raw.carbs as number)
    const fat = round1(raw.fat as number)
    const bound = boundsError(name, calories, protein, carbs, fat)
    if (bound) {
      invalid.push({ clientId, reason: bound })
      continue
    }
    if (raw.weightG !== null && raw.weightG !== undefined && !isValidWeight(raw.weightG)) {
      invalid.push({ clientId, reason: `The weight for "${name}" is not valid.` })
      continue
    }
    items.push({
      name,
      source: 'manual',
      matchedFoodId: null,
      matchedFoodName: null,
      weightG: raw.weightG ?? null,
      calories,
      protein,
      carbs,
      fat,
      detected: Boolean(raw.detected),
      originalName: raw.originalName ?? null,
      aiConfidence: isFiniteNumber(raw.aiConfidence) ? raw.aiConfidence : null
    })
  }

  if (invalid.length > 0) return { ok: false, invalid }
  return { ok: true, items }
}

// Server-authoritative totals: the deterministic sum of the VALIDATED item
// values above, never a number the browser sent. The row's own
// calories/protein/carbs/fat CHECK constraints are re-checked here so an
// oversized aggregate is a clean error, not a failed INSERT.
export function computeConfirmedTotals(
  items: ValidatedReviewItem[]
): { ok: true; totals: MacroTotals } | { ok: false; reason: string } {
  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 } as MacroTotals
  )
  const rounded: MacroTotals = {
    calories: round1(totals.calories),
    protein: round1(totals.protein),
    carbs: round1(totals.carbs),
    fat: round1(totals.fat)
  }
  if (rounded.calories > OUTSIDE_PLAN_MAX_CALORIES) {
    return { ok: false, reason: `The total (${Math.round(rounded.calories)} kcal) is more than we can record in one entry - split it into two entries.` }
  }
  if (rounded.protein > OUTSIDE_PLAN_MAX_MACRO_G || rounded.carbs > OUTSIDE_PLAN_MAX_MACRO_G || rounded.fat > OUTSIDE_PLAN_MAX_MACRO_G) {
    return { ok: false, reason: `A macro total is over ${OUTSIDE_PLAN_MAX_MACRO_G} g - split this into two entries.` }
  }
  return { ok: true, totals: rounded }
}

// 0-1 -> the three-value bucket outside_plan_food_entries.ai_confidence
// accepts (migration 0031). null stays null.
export function bucketConfidence(score: number | null | undefined): 'high' | 'medium' | 'low' | null {
  if (!isFiniteNumber(score)) return null
  if (score >= 0.75) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}

// True if the user changed anything the AI proposed: any manual value on a
// detected item, any hand-added item, a removed item, a renamed item, or a
// changed weight. Derived server-side rather than trusting a client flag.
export function deriveWasEdited(
  analysis: Pick<FoodAnalysisResult, 'items'>,
  finalItems: ValidatedReviewItem[]
): boolean {
  const detectedFinal = finalItems.filter(i => i.detected)
  if (finalItems.length !== analysis.items.length) return true
  if (detectedFinal.some(i => i.source === 'manual')) return true
  if (finalItems.some(i => !i.detected)) return true

  const originalByName = new Map(analysis.items.map(i => [i.name.trim().toLowerCase(), i]))
  for (const item of detectedFinal) {
    const key = (item.originalName ?? item.name).trim().toLowerCase()
    const original = originalByName.get(key)
    if (!original) return true // renamed away from any AI name
    if (item.name.trim().toLowerCase() !== key) return true
    const originalWeight = original.estimatedWeightG
    if ((originalWeight ?? null) !== (item.weightG ?? null)) return true
  }
  return false
}

export interface OutsidePlanEntryComponent {
  name: string
  source: ReviewItemSource
  matched_food_id: string | null
  estimated_grams: number | null
  calories: number
  protein: number
  carbs: number
  fat: number
  detected: boolean
  original_name: string | null
  ai_confidence: number | null
}

export function buildEntryComponents(items: ValidatedReviewItem[]): OutsidePlanEntryComponent[] {
  return items.map(i => ({
    name: i.name,
    source: i.source,
    matched_food_id: i.matchedFoodId,
    estimated_grams: i.weightG,
    calories: i.calories,
    protein: i.protein,
    carbs: i.carbs,
    fat: i.fat,
    detected: i.detected,
    original_name: i.originalName,
    ai_confidence: i.aiConfidence
  }))
}

// A short human label for the entry (outside_plan_food_entries.item_name,
// which is NOT NULL and must be non-blank). Prefers the AI's own meal
// description, else joins the item names, else a generic fallback.
export function buildEntryLabel(mealDescription: string | null, items: ValidatedReviewItem[]): string {
  const fromDescription = (mealDescription ?? '').trim()
  if (fromDescription) return fromDescription.slice(0, 200)
  const joined = items.map(i => i.name).filter(Boolean).join(', ').trim()
  if (joined) return joined.slice(0, 200)
  return 'Outside-plan food'
}

export interface BuildEntryRowParams {
  userId: string
  trackingDate: string
  mealContext: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  items: ValidatedReviewItem[]
  totals: MacroTotals
  analysis: FoodAnalysisResult
  aiModel: string | null
  imageStoragePath: string | null
}

// The full outside_plan_food_entries INSERT payload (migration 0031). Every
// numeric field here is a server-derived value from computeConfirmedTotals /
// validateConfirmItems - never a client number.
export function buildOutsidePlanEntryRow(params: BuildEntryRowParams): Record<string, unknown> {
  return {
    user_id: params.userId,
    tracking_date: params.trackingDate,
    meal_context: params.mealContext,
    source: 'ai_scan',
    item_name: buildEntryLabel(params.analysis.mealDescription, params.items),
    quantity_description: params.analysis.mealDescription?.trim() || null,
    components: buildEntryComponents(params.items),
    quantity_value: null,
    quantity_unit: null,
    calories: params.totals.calories,
    protein: params.totals.protein,
    carbs: params.totals.carbs,
    fat: params.totals.fat,
    ai_model: params.aiModel,
    ai_confidence: bucketConfidence(params.analysis.overallConfidence),
    // Our own normalized FoodAnalysisResult only - never a provider envelope
    // (same rule as food_scan_events.ai_response, migration 0031 header).
    ai_raw_response: params.analysis,
    was_edited: deriveWasEdited(params.analysis, params.items),
    image_storage_path: params.imageStoragePath
  }
}

// ---- Idempotency ----

// Pure decision for whether a food_scan_events row may be confirmed by this
// user right now. The confirm action loads the row scoped to (id, user_id);
// this function is the last gate before an INSERT. 'already_confirmed'
// carries the existing entry id so the caller can return that entry instead
// of creating a duplicate (double-click, retry, resubmit).
export function assertScanEventConfirmable(
  event: { user_id: string; resulting_entry_id: string | null } | null,
  userId: string
): { status: 'ok' } | { status: 'not_found' } | { status: 'already_confirmed'; entryId: string } {
  if (!event || event.user_id !== userId) return { status: 'not_found' }
  if (event.resulting_entry_id) return { status: 'already_confirmed', entryId: event.resulting_entry_id }
  return { status: 'ok' }
}

// ---- Daily-tracking fold ----

// Adds the confirmed outside-plan portion onto the planned-meal consumed
// total. Returned separately so daily_tracking can persist both the TRUE
// total (planned + outside) and the outside-only portion (migration 0031:
// "planned portion stays cleanly derivable as total minus outside_plan_*").
export function foldOutsidePlanIntoConsumed(
  plannedConsumed: MacroTotals,
  outsidePlanRows: ReadonlyArray<{ calories: number; protein: number; carbs: number; fat: number }>
): { consumed: MacroTotals; outsidePlanTotals: MacroTotals } {
  const outsidePlanTotals = outsidePlanRows.reduce(
    (acc, r) => ({
      calories: acc.calories + Number(r.calories || 0),
      protein: acc.protein + Number(r.protein || 0),
      carbs: acc.carbs + Number(r.carbs || 0),
      fat: acc.fat + Number(r.fat || 0)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 } as MacroTotals
  )
  return {
    consumed: {
      calories: plannedConsumed.calories + outsidePlanTotals.calories,
      protein: plannedConsumed.protein + outsidePlanTotals.protein,
      carbs: plannedConsumed.carbs + outsidePlanTotals.carbs,
      fat: plannedConsumed.fat + outsidePlanTotals.fat
    },
    outsidePlanTotals
  }
}
