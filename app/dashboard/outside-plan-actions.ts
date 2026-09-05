'use server'

// Server Actions for the Outside-Plan Food Scanner review + confirm flow
// (Phase 5). The heavy upload/analysis step is a Route Handler
// (app/api/outside-plan/analyze/route.ts) - these actions are the small,
// JSON-sized operations: re-resolve one item's nutrition, confirm a
// reviewed scan into a tracked entry, and read/delete today's entries.
//
// Every action authenticates via the session (getUser) and derives user
// identity from it - a client-supplied user_id, scan id contents, or any
// calorie/macro/total value is never trusted. Matched-food macros are
// always recomputed server-side from a fresh food_database read; only
// manually-entered nutrition is taken from the client, and only after it
// passes the same numeric bounds the table's CHECK constraints enforce.
//
// PLAN ISOLATION: none of these actions read or write diet_plans, meals,
// foods, food_tracking, or food_database (beyond a read-only catalog fetch
// for matching). Confirming an outside-plan scan is structurally incapable
// of changing the active diet plan.

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { isPlausibleToday, shiftDateUTC } from '@/lib/tracking/date'
import {
  buildOutsidePlanAnalytics,
  type OutsidePlanAnalytics,
  type OutsidePlanAnalyticsInput,
  type OutsidePlanComponentInput,
  type OutsidePlanEntryInput,
  type DailySnapshotInput
} from '@/lib/outsidePlan/analytics'
import { fetchActiveFoodCandidates } from '@/lib/outsidePlan/nutritionResolutionService'
import { matchFoodCandidate, type NutritionMatchTier } from '@/lib/outsidePlan/nutritionMatching'
import { deleteFoodScanImage } from '@/lib/outsidePlan/storage'
import {
  assertScanEventConfirmable,
  buildOutsidePlanEntryRow,
  computeConfirmedTotals,
  interpretClaimResult,
  validateConfirmItems,
  type ConfirmItemInput
} from '@/lib/outsidePlan/reviewModel'
import { recomputeDailyTracking } from './tracking-actions'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import type { MacroTotals } from '@/lib/tracking/logic'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'

type Result<T> = { data: T } | { error: string }

const MEAL_CONTEXTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
type MealContext = (typeof MEAL_CONTEXTS)[number]

function normalizeMealContext(value: unknown): MealContext | null {
  return typeof value === 'string' && (MEAL_CONTEXTS as readonly string[]).includes(value) ? (value as MealContext) : null
}

function toFoodMacro(c: {
  id: string
  name: string
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}): FoodMacro {
  return {
    id: c.id,
    name: c.name,
    serving_size: c.serving_size,
    serving_unit: c.serving_unit,
    calories: c.calories,
    protein: c.protein,
    carbs: c.carbs,
    fat: c.fat
  }
}

// ---- Re-resolve one item's nutrition (Phase 5 section 12) ----
// A nutrition lookup, NOT a vision call: when the user renames an item in
// the review screen ("Rice" -> "Cooked White Rice") this re-runs the exact
// same Phase 4 matcher against the catalog and returns a fresh match (or a
// still-unresolved result). Kimi is never called again.
export async function reResolveOutsidePlanItem(name: string): Promise<
  Result<{
    matchedFoodId: string | null
    matchedFoodName: string | null
    tier: NutritionMatchTier
    confidence: number
    basis: FoodMacro | null
    warnings: string[]
  }>
> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof name !== 'string' || !name.trim()) return { error: 'Enter a food name to look up.' }

  const supabase = await createClient()
  const candidates = await fetchActiveFoodCandidates(supabase)
  const match = matchFoodCandidate(name.trim(), candidates)

  return {
    data: {
      matchedFoodId: match.candidate?.id ?? null,
      matchedFoodName: match.candidate?.name ?? null,
      tier: match.tier,
      confidence: match.confidence,
      basis: match.candidate ? toFoodMacro(match.candidate) : null,
      warnings: match.warnings
    }
  }
}

// ---- Discard a pending (unconfirmed) scan (Phase 5 section 15) ----
// Called when the user retakes the photo or leaves the review screen
// without confirming. Deletes the Storage object immediately rather than
// waiting for Phase 2's 24h orphan sweep, and clears the pointer on the
// event row. Never touches a scan that was already confirmed
// (resulting_entry_id set) - that image is now a real entry's photo,
// subject to the 90-day retention policy instead.
export async function discardOutsidePlanScan(scanEventId: string): Promise<Result<{ discarded: true }>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof scanEventId !== 'string' || !scanEventId) return { error: 'Invalid request.' }

  const supabase = await createClient()

  const { data: event } = await supabase
    .from('food_scan_events')
    .select('id, image_storage_path, resulting_entry_id')
    .eq('id', scanEventId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!event || event.resulting_entry_id) {
    // Not found, not owned, or already confirmed - nothing to discard.
    return { data: { discarded: true } }
  }

  if (event.image_storage_path) {
    await deleteFoodScanImage(supabase, event.image_storage_path).catch(() => {})
    await supabase.from('food_scan_events').update({ image_storage_path: null }).eq('id', event.id).eq('user_id', user.id)
  }

  return { data: { discarded: true } }
}

// ---- Confirm (Phase 5 sections 16-20) ----

export interface ConfirmOutsidePlanScanInput {
  scanEventId: string
  localDate: string
  mealContext: string | null
  items: ConfirmItemInput[]
}

export interface ConfirmOutsidePlanScanResult {
  entryId: string
  totals: MacroTotals
  alreadyConfirmed: boolean
}

export async function confirmOutsidePlanScan(
  input: ConfirmOutsidePlanScanInput
): Promise<Result<ConfirmOutsidePlanScanResult>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  if (!input || typeof input.scanEventId !== 'string' || !input.scanEventId) {
    return { error: 'Invalid request.' }
  }
  if (!isPlausibleToday(input.localDate)) {
    return { error: 'Outside-plan food can only be logged for today.' }
  }
  const mealContext = normalizeMealContext(input.mealContext)

  const supabase = await createClient()

  // Ownership check: (id, user_id). RLS enforces this too - this is the
  // explicit gate. A scan id belonging to another user simply returns no
  // row and is reported as "not found", never as a permission error that
  // would confirm the id exists.
  const { data: event } = await supabase
    .from('food_scan_events')
    .select('id, user_id, ai_model, ai_response, image_storage_path, resulting_entry_id')
    .eq('id', input.scanEventId)
    .eq('user_id', user.id)
    .maybeSingle()

  const gate = assertScanEventConfirmable(
    event ? { user_id: event.user_id, resulting_entry_id: event.resulting_entry_id } : null,
    user.id
  )

  if (gate.status === 'not_found') {
    return { error: 'That scan could not be found. Please start a new scan.' }
  }

  if (gate.status === 'already_confirmed') {
    // Idempotent replay (double-click / retry / resubmit): return the entry
    // that was already created, never a second one.
    const existing = await loadEntryTotals(supabase, user.id, gate.entryId)
    if (!existing) return { error: 'That scan was already logged.' }
    return { data: { entryId: gate.entryId, totals: existing, alreadyConfirmed: true } }
  }

  const analysis = (event?.ai_response ?? null) as FoodAnalysisResult | null
  if (!analysis || !Array.isArray(analysis.items)) {
    // ai_response is nulled ~48h after the scan (migration 0031) - a
    // confirm attempt after that window is an expired scan, not an error.
    return { error: 'That scan has expired. Please take a new photo.' }
  }

  // Re-fetch the catalog NOW and recompute every matched item's macros from
  // it - the analysis-time numbers are never trusted at confirm time.
  const candidates = await fetchActiveFoodCandidates(supabase)
  const candidatesById = new Map(candidates.map(c => [c.id, toFoodMacro(c)]))

  const validated = validateConfirmItems(Array.isArray(input.items) ? input.items : [], candidatesById)
  if (!validated.ok) {
    return { error: validated.invalid[0]?.reason ?? 'Some foods still need nutrition information.' }
  }

  const totalsResult = computeConfirmedTotals(validated.items)
  if (!totalsResult.ok) return { error: totalsResult.reason }

  const row = buildOutsidePlanEntryRow({
    userId: user.id,
    trackingDate: input.localDate,
    mealContext,
    items: validated.items,
    totals: totalsResult.totals,
    analysis,
    aiModel: event?.ai_model ?? null,
    imageStoragePath: event?.image_storage_path ?? null
  })

  const { data: inserted, error: insertError } = await supabase
    .from('outside_plan_food_entries')
    .insert(row)
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[outside-plan] confirm insert failed:', insertError)
    return { error: 'Failed to save this entry. Please try again.' }
  }

  // Claim the scan event for this entry. The `.is('resulting_entry_id',
  // null)` guard makes this the idempotency point: if a concurrent confirm
  // already claimed the event, zero rows update here and the entry we just
  // inserted is a duplicate that must be rolled back.
  const { data: claimed, error: claimError } = await supabase
    .from('food_scan_events')
    .update({ resulting_entry_id: inserted.id })
    .eq('id', input.scanEventId)
    .eq('user_id', user.id)
    .is('resulting_entry_id', null)
    .select('id')

  if (interpretClaimResult(claimed, claimError) === 'lost') {
    // Lost the race - undo our insert and return the winner's entry so the
    // caller still sees a success (one entry exists, which is correct).
    await supabase.from('outside_plan_food_entries').delete().eq('id', inserted.id).eq('user_id', user.id)

    const { data: winnerEvent } = await supabase
      .from('food_scan_events')
      .select('resulting_entry_id')
      .eq('id', input.scanEventId)
      .eq('user_id', user.id)
      .maybeSingle()

    const winnerId = winnerEvent?.resulting_entry_id ?? null
    const winnerTotals = winnerId ? await loadEntryTotals(supabase, user.id, winnerId) : null
    if (!winnerId || !winnerTotals) {
      return { error: 'Failed to save this entry. Please try again.' }
    }
    await recomputeDailyTracking(input.localDate)
    return { data: { entryId: winnerId, totals: winnerTotals, alreadyConfirmed: true } }
  }

  // daily_tracking rollup: the persisted snapshot now reflects planned +
  // outside-plan as the TRUE daily total (migration 0031). Recomputed from
  // the summed entries, so it is safe to run more than once.
  await recomputeDailyTracking(input.localDate)

  return { data: { entryId: inserted.id, totals: totalsResult.totals, alreadyConfirmed: false } }
}

async function loadEntryTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  entryId: string
): Promise<MacroTotals | null> {
  const { data } = await supabase
    .from('outside_plan_food_entries')
    .select('calories, protein, carbs, fat')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return {
    calories: Number(data.calories),
    protein: Number(data.protein),
    carbs: Number(data.carbs),
    fat: Number(data.fat)
  }
}

// ---- Read / delete today's outside-plan entries (Phase 5 section 23) ----

export interface OutsidePlanLogEntry {
  id: string
  itemName: string
  loggedAt: string
  mealContext: string | null
  // 'ai_scan' or 'manual' - how the ENTRY was created. Provider internals
  // (raw Kimi response, model ids) are never included here.
  source: string
  wasEdited: boolean
  itemCount: number
  // Per-item provenance derived from the components JSONB: how many items
  // got nutrition from a food_database match vs. hand-entered nutrition.
  matchedItemCount: number
  manualItemCount: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

function countComponentSources(components: unknown): { matched: number; manual: number } {
  if (!Array.isArray(components)) return { matched: 0, manual: 0 }
  let matched = 0
  let manual = 0
  for (const c of components) {
    if (c && typeof c === 'object' && (c as { source?: unknown }).source === 'matched') matched++
    else manual++
  }
  return { matched, manual }
}

export async function getOutsidePlanFoodLog(localDate: string): Promise<Result<OutsidePlanLogEntry[]>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Invalid date.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outside_plan_food_entries')
    .select('id, item_name, logged_at, meal_context, source, was_edited, components, calories, protein, carbs, fat')
    .eq('user_id', user.id)
    .eq('tracking_date', localDate)
    .order('logged_at', { ascending: false })

  if (error) {
    console.error('[outside-plan] getOutsidePlanFoodLog failed:', error)
    return { error: 'Failed to load your outside-plan food. Please try again.' }
  }

  const entries: OutsidePlanLogEntry[] = (data ?? []).map(r => {
    const counts = countComponentSources(r.components)
    return {
      id: r.id as string,
      itemName: r.item_name as string,
      loggedAt: r.logged_at as string,
      mealContext: (r.meal_context as string | null) ?? null,
      source: r.source as string,
      wasEdited: Boolean(r.was_edited),
      itemCount: Array.isArray(r.components) ? r.components.length : 0,
      matchedItemCount: counts.matched,
      manualItemCount: counts.manual,
      calories: Number(r.calories),
      protein: Number(r.protein),
      carbs: Number(r.carbs),
      fat: Number(r.fat)
    }
  })

  return { data: entries }
}

export async function deleteOutsidePlanEntry(entryId: string, localDate: string): Promise<Result<{ deleted: true }>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof entryId !== 'string' || !entryId) return { error: 'Invalid request.' }
  if (!isPlausibleToday(localDate)) return { error: 'Outside-plan food can only be changed for today.' }

  const supabase = await createClient()

  // Scoped delete: (id, user_id). RLS also restricts this to the owner.
  const { data: deleted, error } = await supabase
    .from('outside_plan_food_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    console.error('[outside-plan] deleteOutsidePlanEntry failed:', error)
    return { error: 'Failed to remove that entry. Please try again.' }
  }
  if (!deleted || deleted.length === 0) {
    return { error: 'That entry could not be found.' }
  }

  await recomputeDailyTracking(localDate)
  return { data: { deleted: true } }
}

// ---- Outside-plan analytics (Phase 7) ----
//
// One range query against outside_plan_food_entries (the authoritative,
// item-level, delete-reflecting source) + one against daily_tracking (only
// for each day's snapshot so the pure builder can derive the PLANNED
// portion) + a lightweight active-plan check. All aggregation is pure
// (lib/outsidePlan/analytics.ts). No Kimi, no nutrition resolver, no
// per-entry query. Every row is user-scoped; RLS is the backstop.
//
// Provider internals are stripped here: components are reduced to
// {name, source, macros} - matched_food_id, estimated_grams, ai_confidence,
// detected, original_name and the entry's ai_raw_response / ai_model /
// image_storage_path never leave the server.

export type OutsidePlanAnalyticsPeriod = '7d' | '30d'

export interface GetOutsidePlanAnalyticsResult {
  analytics: OutsidePlanAnalytics
  period: OutsidePlanAnalyticsPeriod
  rangeStart: string
  rangeEnd: string
}

function normalizeComponents(raw: unknown): OutsidePlanComponentInput[] {
  if (!Array.isArray(raw)) return []
  const out: OutsidePlanComponentInput[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const o = c as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name : ''
    if (!name.trim()) continue
    out.push({
      name,
      source: o.source === 'matched' ? 'matched' : 'manual',
      calories: typeof o.calories === 'number' ? o.calories : null,
      protein: typeof o.protein === 'number' ? o.protein : null,
      carbs: typeof o.carbs === 'number' ? o.carbs : null,
      fat: typeof o.fat === 'number' ? o.fat : null
    })
  }
  return out
}

export async function getOutsidePlanAnalytics(
  localDate: string,
  period: OutsidePlanAnalyticsPeriod
): Promise<Result<GetOutsidePlanAnalyticsResult>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Invalid date.' }

  const resolvedPeriod: OutsidePlanAnalyticsPeriod = period === '30d' ? '30d' : '7d'
  const days = resolvedPeriod === '30d' ? 30 : 7
  const rangeEnd = localDate
  const rangeStart = shiftDateUTC(localDate, -(days - 1))

  const supabase = await createClient()

  const [{ data: entryRows, error: entryError }, { data: snapshotRows, error: snapshotError }, { data: activePlans }] =
    await Promise.all([
      supabase
        .from('outside_plan_food_entries')
        .select('id, tracking_date, logged_at, source, was_edited, meal_context, calories, protein, carbs, fat, components')
        .eq('user_id', user.id)
        .gte('tracking_date', rangeStart)
        .lte('tracking_date', rangeEnd)
        .order('logged_at', { ascending: true }),
      supabase
        .from('daily_tracking')
        .select('tracking_date, calories, protein, carbs, fat, outside_plan_calories, outside_plan_protein, outside_plan_carbs, outside_plan_fat')
        .eq('user_id', user.id)
        .gte('tracking_date', rangeStart)
        .lte('tracking_date', rangeEnd),
      supabase.from('diet_plans').select('id').eq('user_id', user.id).eq('is_active', true).limit(1)
    ])

  if (entryError || snapshotError) {
    console.error('[outside-plan] getOutsidePlanAnalytics query failed:', entryError?.message, snapshotError?.message)
    return { error: 'Failed to load outside-plan analytics. Please try again.' }
  }

  const entries: OutsidePlanEntryInput[] = (entryRows ?? []).map(r => ({
    id: r.id as string,
    trackingDate: r.tracking_date as string,
    loggedAt: r.logged_at as string,
    source: (r.source as string) === 'ai_scan' ? 'ai_scan' : 'manual',
    wasEdited: Boolean(r.was_edited),
    mealContext: (r.meal_context as string | null) ?? null,
    calories: Number(r.calories) || 0,
    protein: Number(r.protein) || 0,
    carbs: Number(r.carbs) || 0,
    fat: Number(r.fat) || 0,
    components: normalizeComponents(r.components)
  }))

  const snapshots: DailySnapshotInput[] = (snapshotRows ?? []).map(r => ({
    trackingDate: r.tracking_date as string,
    total: {
      calories: Number(r.calories) || 0,
      protein: Number(r.protein) || 0,
      carbs: Number(r.carbs) || 0,
      fat: Number(r.fat) || 0
    },
    outsidePlan: {
      calories: Number(r.outside_plan_calories) || 0,
      protein: Number(r.outside_plan_protein) || 0,
      carbs: Number(r.outside_plan_carbs) || 0,
      fat: Number(r.outside_plan_fat) || 0
    }
  }))

  const input: OutsidePlanAnalyticsInput = {
    rangeStart,
    rangeEnd,
    entries,
    snapshots,
    hasActivePlan: Boolean(activePlans && activePlans.length > 0)
  }

  return {
    data: {
      analytics: buildOutsidePlanAnalytics(input),
      period: resolvedPeriod,
      rangeStart,
      rangeEnd
    }
  }
}
