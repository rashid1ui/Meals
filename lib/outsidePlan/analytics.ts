// Pure analytics for the AI Outside-Plan Food Scanner (Phase 7). No Supabase,
// no React, no 'server-only' - same pure/glue split the rest of this feature
// uses (nutritionResolution.ts / reviewModel.ts are pure; their *Service.ts /
// *-actions.ts wrappers touch the DB). All aggregation lives here so it is
// unit-testable with plain fixtures; app/dashboard/outside-plan-actions.ts's
// getOutsidePlanAnalytics is the thin range-query + normalize wrapper.
//
// SOURCE-OF-TRUTH RULE (Phase 6 architecture, restated for analytics):
//   - Every OUTSIDE-PLAN number comes from outside_plan_food_entries (the
//     current, item-level source - a deleted entry is simply absent).
//   - PLANNED-consumed for a day is the daily_tracking snapshot's own
//     planned portion: max(0, daily_tracking.<macro> - outside_plan_<macro>).
//   - TRUE consumed = planned(snapshot) + outside(entries). It is DERIVED,
//     never read straight from daily_tracking.<macro>, so it can never
//     double-count an overlapping column and always reflects current entries.
//
// The vision model is never called here (or anywhere downstream of a
// confirmed entry). This is cheap database-derived aggregation only.

import { shiftDateUTC } from '@/lib/tracking/date'

// ---- Inputs (normalized DB rows) ----

export interface OutsidePlanComponentInput {
  name: string
  source: 'matched' | 'manual' | string
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export interface OutsidePlanEntryInput {
  id: string
  trackingDate: string // YYYY-MM-DD
  loggedAt: string // ISO timestamp
  source: 'ai_scan' | 'manual' | string
  wasEdited: boolean
  mealContext: string | null
  calories: number
  protein: number
  carbs: number
  fat: number
  components: OutsidePlanComponentInput[]
}

// One daily_tracking row for a date in range - only the fields analytics
// needs. `total` is daily_tracking.calories/protein/carbs/fat (the Phase 6
// TRUE total); `outsidePlan` is daily_tracking.outside_plan_*.
export interface DailySnapshotInput {
  trackingDate: string
  total: { calories: number; protein: number; carbs: number; fat: number }
  outsidePlan: { calories: number; protein: number; carbs: number; fat: number }
}

export interface OutsidePlanAnalyticsInput {
  rangeStart: string // YYYY-MM-DD inclusive
  rangeEnd: string // YYYY-MM-DD inclusive
  entries: OutsidePlanEntryInput[]
  snapshots: DailySnapshotInput[]
  hasActivePlan: boolean
}

// ---- Outputs ----

export interface OutsidePlanDailyPoint {
  date: string
  entryCount: number
  outsidePlanCalories: number
  outsidePlanProtein: number
  outsidePlanCarbs: number
  outsidePlanFat: number
  // From the snapshot's own planned portion (max(0, total - outside_plan)).
  plannedConsumedCalories: number
  // plannedConsumedCalories + outsidePlanCalories (entries). Derived.
  trueConsumedCalories: number
  // outsidePlanCalories / trueConsumedCalories * 100. null when denominator 0.
  outsidePlanPercent: number | null
  // A daily_tracking snapshot exists for this date OR there is >=1 entry.
  // Distinguishes "tracked, no outside-plan food" from "no tracking at all".
  hasTracking: boolean
  hasOutsidePlan: boolean
}

export interface OutsidePlanTopFood {
  name: string // display casing (first seen)
  occurrences: number // component appearances across confirmed entries
  entryCount: number // distinct entries that contained this food
  totalCalories: number // sum of component calories (0 where a component's calories were null)
  matchedOccurrences: number
  manualOccurrences: number
}

export type OutsidePlanTrend = 'increasing' | 'decreasing' | 'flat' | 'insufficient'

export interface OutsidePlanAnalytics {
  period: { start: string; end: string; days: number }
  // No confirmed outside-plan entries in the range at all.
  isEmpty: boolean
  summary: {
    entryCount: number
    daysWithOutsidePlan: number
    daysTracked: number
    outsidePlanCalories: number
    outsidePlanProtein: number
    outsidePlanCarbs: number
    outsidePlanFat: number
    // outsidePlanCalories / number of days that had >=1 outside-plan entry.
    avgCaloriesPerOutsidePlanDay: number | null
    // outsidePlanCalories / entryCount.
    avgCaloriesPerEntry: number | null
    // period outside-plan calories / period TRUE consumed calories * 100.
    outsidePlanPercent: number | null
    trend: OutsidePlanTrend
  }
  daily: OutsidePlanDailyPoint[]
  topFoods: OutsidePlanTopFood[]
  plannedVsOutside: {
    plannedConsumedCalories: number
    outsidePlanCalories: number
    trueConsumedCalories: number
    outsidePlanPercent: number | null
    // false when there is no snapshot data in range (or no active plan) -
    // the UI omits the comparison rather than implying planned intake was 0.
    available: boolean
  }
  macros: {
    outsidePlan: { calories: number; protein: number; carbs: number; fat: number }
    // TRUE consumed macro totals (planned portion from snapshots + outside
    // from entries). null when there is no snapshot data to base planned on.
    trueConsumed: { calories: number; protein: number; carbs: number; fat: number } | null
  }
  provenance: {
    aiScanEntries: number
    manualEntries: number
    matchedComponents: number
    manualComponents: number
  }
}

export const TOP_FOODS_LIMIT = 8

// ---- helpers ----

function clamp0(n: number): number {
  return n > 0 ? n : 0
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

// Every calendar date from start to end inclusive, in order.
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = []
  let cursor = start
  // Guard against a reversed range or a runaway loop.
  for (let i = 0; i < 400 && cursor <= end; i++) {
    out.push(cursor)
    cursor = shiftDateUTC(cursor, 1)
  }
  return out
}

// outsideCalories / trueConsumedCalories * 100. Full precision; the UI
// rounds at the presentation boundary (Phase 7 section 19). null when there
// is nothing consumed to take a percentage of.
export function computeOutsidePlanPercent(outsideCalories: number, trueConsumedCalories: number): number | null {
  if (!(trueConsumedCalories > 0)) return null
  return (outsideCalories / trueConsumedCalories) * 100
}

// ---- daily aggregation ----

export function deriveDailyPoints(input: OutsidePlanAnalyticsInput): OutsidePlanDailyPoint[] {
  const entriesByDate = new Map<string, OutsidePlanEntryInput[]>()
  for (const e of input.entries) {
    const list = entriesByDate.get(e.trackingDate)
    if (list) list.push(e)
    else entriesByDate.set(e.trackingDate, [e])
  }

  const snapshotByDate = new Map(input.snapshots.map(s => [s.trackingDate, s]))

  return datesInRange(input.rangeStart, input.rangeEnd).map(date => {
    const dayEntries = entriesByDate.get(date) ?? []
    const snapshot = snapshotByDate.get(date)

    const outsidePlanCalories = dayEntries.reduce((n, e) => n + num(e.calories), 0)
    const outsidePlanProtein = dayEntries.reduce((n, e) => n + num(e.protein), 0)
    const outsidePlanCarbs = dayEntries.reduce((n, e) => n + num(e.carbs), 0)
    const outsidePlanFat = dayEntries.reduce((n, e) => n + num(e.fat), 0)

    // Planned portion is the snapshot's own (total - outside_plan) - both
    // numbers from the SAME snapshot, so it stays internally consistent even
    // if the snapshot is momentarily behind the entries.
    const plannedConsumedCalories = snapshot ? clamp0(num(snapshot.total.calories) - num(snapshot.outsidePlan.calories)) : 0

    const trueConsumedCalories = plannedConsumedCalories + outsidePlanCalories

    return {
      date,
      entryCount: dayEntries.length,
      outsidePlanCalories,
      outsidePlanProtein,
      outsidePlanCarbs,
      outsidePlanFat,
      plannedConsumedCalories,
      trueConsumedCalories,
      outsidePlanPercent: computeOutsidePlanPercent(outsidePlanCalories, trueConsumedCalories),
      hasTracking: Boolean(snapshot) || dayEntries.length > 0,
      hasOutsidePlan: dayEntries.length > 0
    }
  })
}

// ---- trend ----
// Split the daily points in half by position and compare mean outside-plan
// calories per calendar day (early half vs late half). Deliberately coarse -
// this only has to answer "roughly up, down, or steady", not fit a line.
export function computeTrend(points: OutsidePlanDailyPoint[]): OutsidePlanTrend {
  const daysWithOutsidePlan = points.filter(p => p.hasOutsidePlan).length
  if (points.length < 4 || daysWithOutsidePlan < 2) return 'insufficient'

  const mid = Math.floor(points.length / 2)
  const firstHalf = points.slice(0, mid)
  const secondHalf = points.slice(points.length - mid)

  const mean = (arr: OutsidePlanDailyPoint[]) => (arr.length ? arr.reduce((n, p) => n + p.outsidePlanCalories, 0) / arr.length : 0)
  const a = mean(firstHalf)
  const b = mean(secondHalf)

  if (a === 0 && b === 0) return 'flat'
  const base = Math.max(a, b, 1)
  const relChange = (b - a) / base
  if (relChange > 0.15) return 'increasing'
  if (relChange < -0.15) return 'decreasing'
  return 'flat'
}

// ---- top foods ----

interface TopFoodAcc {
  display: string
  occurrences: number
  entryIds: Set<string>
  totalCalories: number
  matchedOccurrences: number
  manualOccurrences: number
}

export function rankTopFoods(entries: OutsidePlanEntryInput[], limit = TOP_FOODS_LIMIT): OutsidePlanTopFood[] {
  const acc = new Map<string, TopFoodAcc>()

  for (const entry of entries) {
    for (const comp of entry.components ?? []) {
      const raw = typeof comp?.name === 'string' ? comp.name.trim() : ''
      if (!raw) continue
      const key = raw.toLowerCase()
      let bucket = acc.get(key)
      if (!bucket) {
        bucket = { display: raw, occurrences: 0, entryIds: new Set(), totalCalories: 0, matchedOccurrences: 0, manualOccurrences: 0 }
        acc.set(key, bucket)
      }
      bucket.occurrences += 1
      bucket.entryIds.add(entry.id)
      bucket.totalCalories += num(comp.calories)
      if (comp.source === 'matched') bucket.matchedOccurrences += 1
      else bucket.manualOccurrences += 1
    }
  }

  return Array.from(acc.values())
    .map(b => ({
      name: b.display,
      occurrences: b.occurrences,
      entryCount: b.entryIds.size,
      totalCalories: b.totalCalories,
      matchedOccurrences: b.matchedOccurrences,
      manualOccurrences: b.manualOccurrences
    }))
    .sort((x, y) => y.occurrences - x.occurrences || y.totalCalories - x.totalCalories || x.name.localeCompare(y.name))
    .slice(0, limit)
}

// ---- period summary ----

export function aggregatePeriodSummary(
  points: OutsidePlanDailyPoint[],
  entries: OutsidePlanEntryInput[]
): OutsidePlanAnalytics['summary'] {
  const entryCount = entries.length
  const daysWithOutsidePlan = points.filter(p => p.hasOutsidePlan).length
  const daysTracked = points.filter(p => p.hasTracking).length

  const outsidePlanCalories = points.reduce((n, p) => n + p.outsidePlanCalories, 0)
  const outsidePlanProtein = points.reduce((n, p) => n + p.outsidePlanProtein, 0)
  const outsidePlanCarbs = points.reduce((n, p) => n + p.outsidePlanCarbs, 0)
  const outsidePlanFat = points.reduce((n, p) => n + p.outsidePlanFat, 0)

  const trueConsumedCalories = points.reduce((n, p) => n + p.trueConsumedCalories, 0)

  return {
    entryCount,
    daysWithOutsidePlan,
    daysTracked,
    outsidePlanCalories,
    outsidePlanProtein,
    outsidePlanCarbs,
    outsidePlanFat,
    avgCaloriesPerOutsidePlanDay: daysWithOutsidePlan > 0 ? outsidePlanCalories / daysWithOutsidePlan : null,
    avgCaloriesPerEntry: entryCount > 0 ? outsidePlanCalories / entryCount : null,
    outsidePlanPercent: computeOutsidePlanPercent(outsidePlanCalories, trueConsumedCalories),
    trend: computeTrend(points)
  }
}

// ---- macro aggregation ----

export function aggregateMacros(
  points: OutsidePlanDailyPoint[],
  snapshots: DailySnapshotInput[]
): OutsidePlanAnalytics['macros'] {
  const outsidePlan = {
    calories: points.reduce((n, p) => n + p.outsidePlanCalories, 0),
    protein: points.reduce((n, p) => n + p.outsidePlanProtein, 0),
    carbs: points.reduce((n, p) => n + p.outsidePlanCarbs, 0),
    fat: points.reduce((n, p) => n + p.outsidePlanFat, 0)
  }

  if (snapshots.length === 0) {
    return { outsidePlan, trueConsumed: null }
  }

  // Planned portion of every snapshot in range + the outside-plan portion
  // from entries = TRUE consumed macros for the period.
  const plannedProtein = snapshots.reduce((n, s) => n + clamp0(num(s.total.protein) - num(s.outsidePlan.protein)), 0)
  const plannedCarbs = snapshots.reduce((n, s) => n + clamp0(num(s.total.carbs) - num(s.outsidePlan.carbs)), 0)
  const plannedFat = snapshots.reduce((n, s) => n + clamp0(num(s.total.fat) - num(s.outsidePlan.fat)), 0)
  const plannedCalories = snapshots.reduce((n, s) => n + clamp0(num(s.total.calories) - num(s.outsidePlan.calories)), 0)

  return {
    outsidePlan,
    trueConsumed: {
      calories: plannedCalories + outsidePlan.calories,
      protein: plannedProtein + outsidePlan.protein,
      carbs: plannedCarbs + outsidePlan.carbs,
      fat: plannedFat + outsidePlan.fat
    }
  }
}

// ---- provenance ----

export function aggregateProvenance(entries: OutsidePlanEntryInput[]): OutsidePlanAnalytics['provenance'] {
  let aiScanEntries = 0
  let manualEntries = 0
  let matchedComponents = 0
  let manualComponents = 0
  for (const e of entries) {
    if (e.source === 'ai_scan') aiScanEntries++
    else manualEntries++
    for (const c of e.components ?? []) {
      if (c.source === 'matched') matchedComponents++
      else manualComponents++
    }
  }
  return { aiScanEntries, manualEntries, matchedComponents, manualComponents }
}

// ---- top-level builder ----

export function buildOutsidePlanAnalytics(input: OutsidePlanAnalyticsInput): OutsidePlanAnalytics {
  const daily = deriveDailyPoints(input)
  const summary = aggregatePeriodSummary(daily, input.entries)
  const macros = aggregateMacros(daily, input.snapshots)
  const provenance = aggregateProvenance(input.entries)

  const plannedConsumedCalories = daily.reduce((n, p) => n + p.plannedConsumedCalories, 0)
  const outsidePlanCalories = summary.outsidePlanCalories
  const trueConsumedCalories = plannedConsumedCalories + outsidePlanCalories

  // The planned-vs-outside comparison is only meaningful when there is
  // snapshot data to establish the planned portion (Phase 7 section 15: a
  // no-plan / untracked user gets absolute outside-plan intake, but no
  // fabricated planned figure).
  const comparisonAvailable = input.hasActivePlan && input.snapshots.length > 0 && plannedConsumedCalories > 0

  return {
    period: { start: input.rangeStart, end: input.rangeEnd, days: daily.length },
    isEmpty: input.entries.length === 0,
    summary,
    daily,
    topFoods: rankTopFoods(input.entries),
    plannedVsOutside: {
      plannedConsumedCalories,
      outsidePlanCalories,
      trueConsumedCalories,
      outsidePlanPercent: computeOutsidePlanPercent(outsidePlanCalories, trueConsumedCalories),
      available: comparisonAvailable
    },
    macros,
    provenance
  }
}
