'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { classifyTarget } from '@/lib/diet/diff'
import {
  isPlausibleToday,
  todayUTCString,
  shiftDateUTC,
  daysBetweenInclusive,
  lastDayOfMonthUTC
} from '@/lib/tracking/date'
import {
  computeMealStatus,
  sumMacros,
  zeroMacros,
  pctOf,
  buildFoodTrackingRow,
  dailyAdherencePct,
  type MealStatus,
  type TrackableFood,
  type MacroTotals
} from '@/lib/tracking/logic'

export type FoodCompletionState = {
  foodId: string
  completed: boolean
}

export type MealCompletionState = {
  mealId: string
  name: string
  status: MealStatus
  foods: FoodCompletionState[]
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type DailyTrackingSummary = {
  date: string
  consumed: { calories: number; protein: number; carbs: number; fat: number }
  target: { calories: number; protein: number; carbs: number; fat: number }
  meals: MealCompletionState[]
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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Read-only. Joins today's LIVE meals/foods (the actual current plan)
// against today's food_tracking rows to determine per-meal/per-food
// completion, and reads today's daily_tracking row (if any) for the
// consumed rollup. Never writes - a day with no daily_tracking row yet
// simply shows zero consumed, it is never inserted here.
export async function getTodayTracking(localDate: string): Promise<Result<DailyTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Invalid date.' }

  const supabase = await createClient()

  const { data: activePlans } = await supabase
    .from('diet_plans')
    .select('id, calories_target, protein_target, carbs_target, fat_target')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activePlan = activePlans?.[0]
  if (!activePlan) return { error: 'No active meal plan found.' }

  const { data: meals } = await supabase
    .from('meals')
    .select('id, name, sort_order, foods(id, name, quantity, calories, protein, carbs, fat)')
    .eq('diet_plan_id', activePlan.id)
    .order('sort_order')

  const mealRows = (meals as MealRow[] | null) || []

  const { data: trackedFoods } = await supabase
    .from('food_tracking')
    .select('food_id, completed')
    .eq('user_id', user.id)
    .eq('tracking_date', localDate)

  const completedFoodIds = new Set(
    (trackedFoods || []).filter(f => f.completed && f.food_id).map(f => f.food_id as string)
  )

  const mealStates: MealCompletionState[] = mealRows.map(meal => {
    const totals = sumMacros(meal.foods)
    const status = computeMealStatus(
      meal.foods.map(f => f.id),
      completedFoodIds
    )
    return {
      mealId: meal.id,
      name: meal.name,
      status,
      foods: meal.foods.map(f => ({ foodId: f.id, completed: completedFoodIds.has(f.id) })),
      ...totals
    }
  })

  const { data: dailyRows } = await supabase
    .from('daily_tracking')
    .select('calories, protein, carbs, fat')
    .eq('user_id', user.id)
    .eq('tracking_date', localDate)
    .limit(1)

  const daily = dailyRows?.[0]

  return {
    data: {
      date: localDate,
      consumed: {
        calories: Number(daily?.calories ?? 0),
        protein: Number(daily?.protein ?? 0),
        carbs: Number(daily?.carbs ?? 0),
        fat: Number(daily?.fat ?? 0)
      },
      target: {
        calories: activePlan.calories_target,
        protein: activePlan.protein_target,
        carbs: activePlan.carbs_target,
        fat: activePlan.fat_target
      },
      meals: mealStates
    }
  }
}

// Recomputes today's daily_tracking rollup strictly from completed=true
// food_tracking rows, upserts it, then returns the fresh full state. Shared
// by both toggle actions below so the rollup logic exists in exactly one
// place.
async function recomputeDailyAndReturn(
  supabase: SupabaseServerClient,
  userId: string,
  localDate: string
): Promise<Result<DailyTrackingSummary>> {
  const { data: completedRows, error: sumError } = await supabase
    .from('food_tracking')
    .select('calories, protein, carbs, fat')
    .eq('user_id', userId)
    .eq('tracking_date', localDate)
    .eq('completed', true)

  if (sumError) {
    console.error('[tracking] failed to sum completed food_tracking rows:', sumError)
    return { error: 'Failed to update daily progress. Please try again.' }
  }

  const totals = sumMacros(completedRows || [])

  const { data: activePlans } = await supabase
    .from('diet_plans')
    .select('calories_target, protein_target, carbs_target, fat_target')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)

  const activePlan = activePlans?.[0]
  if (!activePlan) return { error: 'No active meal plan found.' }

  const { error: dailyError } = await supabase.from('daily_tracking').upsert(
    {
      user_id: userId,
      tracking_date: localDate,
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      nutrition_progress: Math.round(pctOf(totals.calories, activePlan.calories_target)),
      calories_target: activePlan.calories_target,
      protein_target: activePlan.protein_target,
      carbs_target: activePlan.carbs_target,
      fat_target: activePlan.fat_target,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id,tracking_date' }
  )

  if (dailyError) {
    console.error('[tracking] failed to upsert daily_tracking:', dailyError)
    return { error: 'Failed to update daily progress. Please try again.' }
  }

  return getTodayTracking(localDate)
}

// Marks ONE food completed/uncompleted for a given date. Idempotent: upserts
// on the (user_id, tracking_date, food_id) unique constraint, so double-
// clicks or repeated requests never create duplicate rows.
export async function toggleFoodCompletion(
  foodId: string,
  mealId: string,
  localDate: string,
  completed: boolean
): Promise<Result<DailyTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Tracking is only available for today.' }

  const supabase = await createClient()

  // Ownership + membership check in one query: the food must belong to both
  // this user AND the meal the client claims it's in. Macros are read fresh
  // here, never trusted from the client.
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

  const row = buildFoodTrackingRow({
    userId: user.id,
    trackingDate: localDate,
    mealId,
    mealName,
    completed,
    food: {
      id: food.id,
      name: food.name,
      quantity: food.quantity,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat
    }
  })

  const { error: upsertError } = await supabase
    .from('food_tracking')
    .upsert(row, { onConflict: 'user_id,tracking_date,food_id' })

  if (upsertError) {
    console.error('[tracking] toggleFoodCompletion upsert failed:', upsertError)
    return { error: 'Failed to save completion. Please try again.' }
  }

  return recomputeDailyAndReturn(supabase, user.id, localDate)
}

// Marks EVERY food in a meal completed/uncompleted for a given date -
// reuses the exact same row-building and rollup logic as
// toggleFoodCompletion above, just fanned out over the meal's foods in one
// batched upsert instead of duplicating the persistence logic.
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
    const rows = foods.map(f =>
      buildFoodTrackingRow({
        userId: user.id,
        trackingDate: localDate,
        mealId,
        mealName: meal.name,
        completed,
        food: f
      })
    )

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

  let sumCal = 0, sumP = 0, sumC = 0, sumF = 0, onTargetDays = 0
  for (const r of rows) {
    sumCal += pctOf(Number(r.calories), r.calories_target)
    sumP += pctOf(Number(r.protein), r.protein_target)
    sumC += pctOf(Number(r.carbs), r.carbs_target)
    sumF += pctOf(Number(r.fat), r.fat_target)
    if (classifyTarget(Number(r.calories), r.calories_target).status === 'on-target') onTargetDays++
  }

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
        calories: Math.round(sumCal / daysWithData),
        protein: Math.round(sumP / daysWithData),
        carbs: Math.round(sumC / daysWithData),
        fat: Math.round(sumF / daysWithData)
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

  const { data: dailyRows } = await supabase
    .from('daily_tracking')
    .select('tracking_date, calories, protein, carbs, fat, calories_target, protein_target, carbs_target, fat_target')
    .eq('user_id', user.id)
    .gte('tracking_date', start)
    .lte('tracking_date', end)

  const dailyByDate = new Map((dailyRows || []).map(r => [r.tracking_date as string, r]))

  const { data: mealRows } = await supabase
    .from('food_tracking')
    .select('tracking_date, meal_id, food_id, completed')
    .eq('user_id', user.id)
    .gte('tracking_date', start)
    .lte('tracking_date', end)
    .not('meal_id', 'is', null)

  // date -> meal_id -> the set of tracked food ids for that meal that day,
  // and which of those are completed. Reuses computeMealStatus's exact
  // complete/partial/none rule (imported from lib/tracking/logic.ts, the
  // same logic the live Dashboard uses for today) rather than a second
  // definition of "meal complete" - "complete" means every food tracked for
  // that meal that day is checked.
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
        if (computeMealStatus(Array.from(group.foodIds), group.completed) === 'complete') mealsCompleted++
      }
    }

    days.push({
      date,
      hasData: Boolean(row),
      adherencePct: row ? dailyAdherencePct(consumed, target) : null,
      consumed,
      target,
      mealsCompleted,
      mealsTotal
    })
  }

  return { data: { year, month, days } }
}
