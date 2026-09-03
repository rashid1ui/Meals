'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { classifyTarget } from '@/lib/diet/diff'
import { effectiveDailyTarget } from '@/lib/diet/effective-target'
import {
  isPlausibleToday,
  todayUTCString,
  shiftDateUTC,
  daysBetweenInclusive,
  lastDayOfMonthUTC
} from '@/lib/tracking/date'
import {
  computeFoodStatus,
  deriveMealStatus,
  computeActualFoodMacros,
  computeDayAdherencePct,
  sumMacros,
  zeroMacros,
  pctOf,
  buildFoodTrackingRow,
  type TrackingStatus,
  type TrackableFood,
  type MacroTotals
} from '@/lib/tracking/logic'
import { splitProteinByType, type ProteinBreakdown, type ProteinType } from '@/lib/nutrition/proteinType'

// One food's tracking state within a meal. `planned` is that food's own
// full planned macros (what it contributes if fully eaten); `actual` is
// whatever amount has actually been logged for it today, sourced directly
// from its food_tracking row - never recomputed from the plan.
export type FoodTrackingState = {
  foodId: string
  status: TrackingStatus
  consumedQuantity: number
  plannedQuantity: number
  planned: MacroTotals
  actual: MacroTotals
}

export type MealCompletionState = {
  mealId: string
  name: string
  status: TrackingStatus
  foods: FoodTrackingState[]
  // What this meal is supposed to deliver in total, vs. what has actually
  // been logged as eaten from it so far today. Deliberately two separate
  // fields (never merged into one ambiguous number) - see FoodRow/MealCard.
  planned: MacroTotals
  actual: MacroTotals
}

export type DailyTrackingSummary = {
  date: string
  consumed: { calories: number; protein: number; carbs: number; fat: number }
  target: { calories: number; protein: number; carbs: number; fat: number }
  meals: MealCompletionState[]
  // Animal/plant/supplement split of `consumed.protein` - always sums to
  // exactly that number (lib/nutrition/proteinType.ts's splitProteinByType
  // classifies every tracked food into exactly one bucket, never drops one).
  proteinBreakdown: ProteinBreakdown
}

export type PeriodTrackingSummary = {
  totalDays: number
  daysWithData: number
  averages: { calories: number; protein: number; carbs: number; fat: number }
  daysOnTarget: number
  // null = not enough data to compute (no daily_tracking rows in range, or
  // no food_tracking rows carrying a meal_id in range) - never fabricated.
  mealAdherence: number | null
}

type Result<T> = { data: T } | { error: string }

interface MealRow {
  id: string
  name: string
  sort_order: number
  foods: TrackableFood[]
}

interface TrackedFoodRow {
  food_id: string | null
  food_name: string
  completed: boolean
  quantity: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface ProteinTypeCatalogRow {
  name: string
  protein_type: ProteinType | null
  category: string | null
}

// Small, shared-catalog lookup (food_database has no per-user scoping) used
// to classify each logged food's protein by source. Loaded fresh on every
// call rather than cached - the catalog is small (dozens of rows) and this
// keeps a newly-added custom food's classification correct immediately.
async function loadProteinTypeLookups(
  supabase: SupabaseServerClient
): Promise<{ typeByName: Map<string, ProteinType | null>; categoryByName: Map<string, string | null> }> {
  const { data } = await supabase.from('food_database').select('name, protein_type, category')
  const rows = (data as ProteinTypeCatalogRow[] | null) || []
  return {
    typeByName: new Map(rows.map(r => [r.name, r.protein_type])),
    categoryByName: new Map(rows.map(r => [r.name, r.category]))
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Read-only. Joins today's LIVE meals/foods (the actual current plan)
// against today's food_tracking rows to determine per-meal/per-food
// completion AND actual consumed quantity/macros. Never writes - a day with
// no food_tracking rows yet simply shows zero consumed.
export async function getTodayTracking(localDate: string): Promise<Result<DailyTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Invalid date.' }

  const supabase = await createClient()

  // The active plan, today's food_tracking rows, and the protein-type catalog
  // lookup have no dependency on each other - fire them together instead of in
  // series (this action previously did several sequential round-trips per
  // dashboard load).
  const [{ data: activePlans }, { data: trackedFoods }, { typeByName, categoryByName }] = await Promise.all([
    supabase
      .from('diet_plans')
      .select('id, plan_source, calories_target, protein_target, carbs_target, fat_target')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1),
    supabase
      .from('food_tracking')
      .select('food_id, food_name, completed, quantity, calories, protein, carbs, fat')
      .eq('user_id', user.id)
      .eq('tracking_date', localDate),
    loadProteinTypeLookups(supabase)
  ])

  const activePlan = activePlans?.[0]
  if (!activePlan) return { error: 'No active meal plan found.' }

  const { data: meals } = await supabase
    .from('meals')
    .select('id, name, sort_order, foods(id, name, quantity, calories, protein, carbs, fat)')
    .eq('diet_plan_id', activePlan.id)
    .order('sort_order')

  const mealRows = (meals as MealRow[] | null) || []

  // Only completed=true rows represent an actual logged quantity - a
  // completed=false row (an explicit "un-mark") is the same as no row.
  const trackedByFoodId = new Map<string, TrackedFoodRow>()
  for (const t of (trackedFoods as TrackedFoodRow[] | null) || []) {
    if (t.completed && t.food_id) trackedByFoodId.set(t.food_id, t)
  }

  const mealStates: MealCompletionState[] = mealRows.map(meal => {
    const planned = sumMacros(meal.foods)

    const foodStates: FoodTrackingState[] = meal.foods.map(f => {
      const tracked = trackedByFoodId.get(f.id)
      const consumedQuantity = tracked ? Number(tracked.quantity) : 0
      const actual: MacroTotals = tracked
        ? {
            calories: Number(tracked.calories),
            protein: Number(tracked.protein),
            carbs: Number(tracked.carbs),
            fat: Number(tracked.fat)
          }
        : zeroMacros()
      return {
        foodId: f.id,
        status: computeFoodStatus(consumedQuantity, f.quantity),
        consumedQuantity,
        plannedQuantity: f.quantity,
        planned: { calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat },
        actual
      }
    })

    return {
      mealId: meal.id,
      name: meal.name,
      status: deriveMealStatus(foodStates.map(f => f.status)),
      foods: foodStates,
      planned,
      actual: sumMacros(foodStates.map(f => f.actual))
    }
  })

  // Single source of truth for "actual consumed": the sum of each meal's own
  // `actual`, which is itself built only from foods that are BOTH in the
  // current live plan (mealRows) AND logged as completed today
  // (trackedByFoodId). This is deliberately NOT a raw sum over `trackedFoods`
  // - a plan edit can leave behind orphaned food_tracking rows (old food id,
  // no longer part of any current meal; see computeFoodRelinkPairs in
  // lib/diet/save-plan.ts) that would otherwise get double-counted alongside
  // their re-linked replacement. Also deliberately not the daily_tracking
  // rollup - that's a periodic snapshot for Weekly/Monthly/Calendar history,
  // not live truth for today (see recomputeDailyAndReturn below).
  const consumed = sumMacros(mealStates.map(m => m.actual))

  // Same plan-scoping applies to the protein-type breakdown: only foods that
  // are in the live plan AND logged today should be classified, so this is
  // derived from mealStates/trackedByFoodId rather than the raw
  // `trackedFoods` array (which can carry orphaned rows - see above).
  // typeByName / categoryByName were resolved in the Promise.all above.
  const completedTrackedFoods = mealRows.flatMap(meal =>
    meal.foods
      .map(f => trackedByFoodId.get(f.id))
      .filter((t): t is TrackedFoodRow => Boolean(t))
  )
  const proteinBreakdown = splitProteinByType(
    completedTrackedFoods.map(t => ({ name: t.food_name, protein: Number(t.protein) })),
    typeByName,
    categoryByName
  )

  return {
    data: {
      date: localDate,
      consumed,
      // A hand-built plan is scored against its own composition, not the
      // onboarding recommendation stored on the row (lib/diet/effective-target.ts).
      target: effectiveDailyTarget(
        activePlan,
        sumMacros(mealRows.flatMap(m => m.foods))
      ),
      meals: mealStates,
      proteinBreakdown
    }
  }
}

// Recomputes today's daily_tracking rollup (the persisted snapshot read by
// Weekly/Monthly/Calendar history) and returns the fresh full state. Reuses
// getTodayTracking as the single source of truth for `consumed`/`target`
// instead of independently re-summing food_tracking - that used to be a
// second, unscoped `completed=true` sum that could double-count orphaned
// rows left behind by a plan edit (see the comment on `consumed` in
// getTodayTracking above), and independently re-derive the target via a
// second `meals` query. Computing it once here and upserting a snapshot of
// it keeps today's live numbers and today's persisted snapshot from ever
// disagreeing.
async function recomputeDailyAndReturn(
  supabase: SupabaseServerClient,
  userId: string,
  localDate: string
): Promise<Result<DailyTrackingSummary>> {
  const result = await getTodayTracking(localDate)
  if ('error' in result) return result

  const { consumed, target } = result.data

  const { error: dailyError } = await supabase.from('daily_tracking').upsert(
    {
      user_id: userId,
      tracking_date: localDate,
      calories: consumed.calories,
      protein: consumed.protein,
      carbs: consumed.carbs,
      fat: consumed.fat,
      nutrition_progress: Math.round(pctOf(consumed.calories, target.calories)),
      calories_target: target.calories,
      protein_target: target.protein,
      carbs_target: target.carbs,
      fat_target: target.fat,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id,tracking_date' }
  )

  if (dailyError) {
    console.error('[tracking] failed to upsert daily_tracking:', dailyError)
    return { error: 'Failed to update daily progress. Please try again.' }
  }

  return result
}

// Logs the ACTUAL quantity of one food eaten for a given date - 0 means "not
// eaten" (un-marks it), a value at or above the food's current planned
// quantity means "fully eaten", anything in between is a partial portion.
// Idempotent: upserts on the (user_id, tracking_date, food_id) unique
// constraint, so repeated requests (e.g. a stepper firing quickly) never
// create duplicate rows - the last write simply wins.
export async function logFoodConsumption(
  foodId: string,
  mealId: string,
  localDate: string,
  consumedQuantity: number
): Promise<Result<DailyTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Tracking is only available for today.' }
  if (typeof consumedQuantity !== 'number' || !isFinite(consumedQuantity) || consumedQuantity < 0) {
    return { error: 'Invalid quantity.' }
  }

  const supabase = await createClient()

  // Ownership + membership check in one query: the food must belong to both
  // this user AND the meal the client claims it's in. The planned
  // quantity/macros used to clamp and scale the consumed amount are read
  // fresh here, never trusted from the client.
  const { data: food } = await supabase
    .from('foods')
    .select('id, name, quantity, calories, protein, carbs, fat, meals(name)')
    .eq('id', foodId)
    .eq('meal_id', mealId)
    .eq('user_id', user.id)
    .single()

  if (!food) return { error: 'Food not found.' }

  const mealsRelation = food.meals as { name: string } | { name: string }[] | null
  const mealName = Array.isArray(mealsRelation) ? mealsRelation[0]?.name : mealsRelation?.name
  if (!mealName) return { error: 'Meal not found.' }

  // Never trust a client-sent quantity beyond what the meal actually
  // contains - clamp to [0, planned] server-side.
  const clampedQuantity = Math.max(0, Math.min(consumedQuantity, food.quantity))
  const plannedFood: TrackableFood = {
    id: food.id,
    name: food.name,
    quantity: food.quantity,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat
  }
  const actualMacros = computeActualFoodMacros(clampedQuantity, plannedFood)

  const row = buildFoodTrackingRow({
    userId: user.id,
    trackingDate: localDate,
    mealId,
    mealName,
    food: { id: food.id, name: food.name, quantity: clampedQuantity, ...actualMacros }
  })

  const { error: upsertError } = await supabase
    .from('food_tracking')
    .upsert(row, { onConflict: 'user_id,tracking_date,food_id' })

  if (upsertError) {
    console.error('[tracking] logFoodConsumption upsert failed:', upsertError)
    return { error: 'Failed to save completion. Please try again.' }
  }

  return recomputeDailyAndReturn(supabase, user.id, localDate)
}

// Bulk shortcut for "I ate this whole meal" / "undo that" - logs every food
// in the meal at its full planned quantity (completed=true) or at zero
// (completed=false). This is purely a convenience that fans the exact same
// per-food logging out over every food in the meal; meal completion is never
// stored independently of its foods (see deriveMealStatus).
export async function toggleMealCompletion(
  mealId: string,
  localDate: string,
  completed: boolean
): Promise<Result<DailyTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Tracking is only available for today.' }

  const supabase = await createClient()

  const { data: meal } = await supabase
    .from('meals')
    .select('id, name, foods(id, name, quantity, calories, protein, carbs, fat)')
    .eq('id', mealId)
    .eq('user_id', user.id)
    .single()

  if (!meal) return { error: 'Meal not found.' }

  const foods = (meal.foods as TrackableFood[]) || []

  if (foods.length > 0) {
    const rows = foods.map(f => {
      const consumedQuantity = completed ? f.quantity : 0
      const actualMacros = computeActualFoodMacros(consumedQuantity, f)
      return buildFoodTrackingRow({
        userId: user.id,
        trackingDate: localDate,
        mealId,
        mealName: meal.name,
        food: { id: f.id, name: f.name, quantity: consumedQuantity, ...actualMacros }
      })
    })

    const { error: upsertError } = await supabase
      .from('food_tracking')
      .upsert(rows, { onConflict: 'user_id,tracking_date,food_id' })

    if (upsertError) {
      console.error('[tracking] toggleMealCompletion upsert failed:', upsertError)
      return { error: 'Failed to save completion. Please try again.' }
    }
  }

  return recomputeDailyAndReturn(supabase, user.id, localDate)
}

async function getPeriodTracking(startDate: string, endDate: string): Promise<Result<PeriodTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: dailyRows } = await supabase
    .from('daily_tracking')
    .select('tracking_date, calories, protein, carbs, fat, calories_target, protein_target, carbs_target, fat_target')
    .eq('user_id', user.id)
    .gte('tracking_date', startDate)
    .lte('tracking_date', endDate)
    .order('tracking_date')

  const rows = dailyRows || []
  const totalDays = daysBetweenInclusive(startDate, endDate)
  const daysWithData = rows.length

  if (daysWithData === 0) {
    return {
      data: {
        totalDays,
        daysWithData: 0,
        averages: zeroMacros(),
        daysOnTarget: 0,
        mealAdherence: null
      }
    }
  }

  // Each macro's percent-of-target is averaged only over the days that
  // actually carry a positive target for that macro. A row with a missing or
  // zero target (a legacy row written before the *_target snapshot columns
  // existed, or any future write path that forgets to set them) would
  // otherwise contribute a silent 0% and drag the average down with no
  // signal. `daysOnTarget` likewise only considers days with a real calorie
  // target - a day with no target genuinely cannot be classified "on target".
  const hasTarget = (t: unknown) => typeof t === 'number' && isFinite(t) && t > 0
  let sumCal = 0, sumP = 0, sumC = 0, sumF = 0, onTargetDays = 0
  let nCal = 0, nP = 0, nC = 0, nF = 0
  for (const r of rows) {
    if (hasTarget(r.calories_target)) {
      sumCal += pctOf(Number(r.calories), r.calories_target); nCal++
      if (classifyTarget(Number(r.calories), r.calories_target).status === 'on-target') onTargetDays++
    }
    if (hasTarget(r.protein_target)) { sumP += pctOf(Number(r.protein), r.protein_target); nP++ }
    if (hasTarget(r.carbs_target)) { sumC += pctOf(Number(r.carbs), r.carbs_target); nC++ }
    if (hasTarget(r.fat_target)) { sumF += pctOf(Number(r.fat), r.fat_target); nF++ }
  }
  const avg = (sum: number, n: number) => (n > 0 ? Math.round(sum / n) : 0)

  const { data: mealRows } = await supabase
    .from('food_tracking')
    .select('tracking_date, meal_id, completed')
    .eq('user_id', user.id)
    .gte('tracking_date', startDate)
    .lte('tracking_date', endDate)
    .not('meal_id', 'is', null)

  let mealAdherence: number | null = null
  if (mealRows && mealRows.length > 0) {
    const grouped = new Map<string, boolean>()
    for (const r of mealRows) {
      const key = `${r.tracking_date}|${r.meal_id}`
      grouped.set(key, (grouped.get(key) || false) || Boolean(r.completed))
    }
    const totalMeals = grouped.size
    if (totalMeals > 0) {
      const completedMeals = Array.from(grouped.values()).filter(Boolean).length
      mealAdherence = Math.round((completedMeals / totalMeals) * 100)
    }
  }

  return {
    data: {
      totalDays,
      daysWithData,
      averages: {
        calories: avg(sumCal, nCal),
        protein: avg(sumP, nP),
        carbs: avg(sumC, nC),
        fat: avg(sumF, nF)
      },
      daysOnTarget: onTargetDays,
      mealAdherence
    }
  }
}

// Trailing 7 days including today (server UTC date as the anchor) - avoids
// picking a Monday/Sunday week-start convention that isn't backed by any
// stored user preference.
export async function getWeeklyTracking(): Promise<Result<PeriodTrackingSummary>> {
  const end = todayUTCString()
  const start = shiftDateUTC(end, -6)
  return getPeriodTracking(start, end)
}

export async function getMonthlyTracking(year: number, month: number): Promise<Result<PeriodTrackingSummary>> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = lastDayOfMonthUTC(year, month)
  return getPeriodTracking(start, end)
}

export type CalendarDay = {
  date: string
  hasData: boolean
  adherencePct: number | null
  consumed: MacroTotals
  target: MacroTotals
  mealsCompleted: number
  mealsTotal: number
}

export type MonthlyCalendar = {
  year: number
  month: number
  days: CalendarDay[]
}

// One row per calendar date in the month (1..lastDay, always in order) - the
// Insights calendar renders directly off this array with no client-side date
// math of its own beyond placing each day in its weekday column. Two queries
// total (daily_tracking for the macro rollup, food_tracking for per-meal
// completion), same shape as getPeriodTracking above.
export async function getMonthlyCalendar(year: number, month: number): Promise<Result<MonthlyCalendar>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: 'Invalid month.' }
  }

  const supabase = await createClient()
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = lastDayOfMonthUTC(year, month)
  const lastDay = Number(end.slice(8, 10))

  const { data: dailyRows, error } = await supabase
    .from('daily_tracking')
    .select('tracking_date, calories, protein, carbs, fat, calories_target, protein_target, carbs_target, fat_target')
    .eq('user_id', user.id)
    .gte('tracking_date', start)
    .lte('tracking_date', end)

  if (error) {
    console.error('[tracking] getMonthlyCalendar failed:', error)
    return { error: 'Failed to load calendar data. Please try again.' }
  }

  const dailyByDate = new Map((dailyRows || []).map(r => [r.tracking_date as string, r]))

  const { data: mealRows } = await supabase
    .from('food_tracking')
    .select('tracking_date, meal_id, food_id, completed')
    .eq('user_id', user.id)
    .gte('tracking_date', start)
    .lte('tracking_date', end)
    .not('meal_id', 'is', null)

  // date -> meal_id -> the set of tracked food ids for that meal that day,
  // and which of those are completed=true (now meaning "consumed quantity >
  // 0" per buildFoodTrackingRow, but a food_tracking row's own completed
  // flag is still exactly what this needs). "Complete" means every food
  // tracked for that meal that day is checked - deliberately NOT
  // computeFoodStatus/deriveMealStatus, since those compare against the
  // LIVE plan's quantities, which may have changed since a past date;
  // this only ever compares a day's own tracked rows against themselves.
  const mealGroups = new Map<string, Map<string, { foodIds: Set<string>; completed: Set<string> }>>()
  for (const r of mealRows || []) {
    if (!r.meal_id || !r.food_id) continue
    let byMeal = mealGroups.get(r.tracking_date as string)
    if (!byMeal) {
      byMeal = new Map()
      mealGroups.set(r.tracking_date as string, byMeal)
    }
    let group = byMeal.get(r.meal_id as string)
    if (!group) {
      group = { foodIds: new Set(), completed: new Set() }
      byMeal.set(r.meal_id as string, group)
    }
    group.foodIds.add(r.food_id as string)
    if (r.completed) group.completed.add(r.food_id as string)
  }

  const days: CalendarDay[] = []
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const row = dailyByDate.get(date)
    const consumed: MacroTotals = {
      calories: Number(row?.calories ?? 0),
      protein: Number(row?.protein ?? 0),
      carbs: Number(row?.carbs ?? 0),
      fat: Number(row?.fat ?? 0)
    }
    const target: MacroTotals = {
      calories: Number(row?.calories_target ?? 0),
      protein: Number(row?.protein_target ?? 0),
      carbs: Number(row?.carbs_target ?? 0),
      fat: Number(row?.fat_target ?? 0)
    }

    const byMeal = mealGroups.get(date)
    let mealsCompleted = 0
    const mealsTotal = byMeal?.size ?? 0
    if (byMeal) {
      for (const group of byMeal.values()) {
        if (group.foodIds.size > 0 && group.completed.size === group.foodIds.size) mealsCompleted++
      }
    }

    days.push({
      date,
      hasData: Boolean(row),
      adherencePct: row ? computeDayAdherencePct(consumed, target) : null,
      consumed,
      target,
      mealsCompleted,
      mealsTotal
    })
  }

  return { data: { year, month, days } }
}
