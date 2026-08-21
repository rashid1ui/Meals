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

export type MealCompletionState = {
  mealId: string
  name: string
  completed: boolean
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

interface MealFoodRow {
  id: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface MealRow {
  id: string
  name: string
  sort_order: number
  foods: MealFoodRow[]
}

function zeroMacros() {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 }
}

function pctOf(value: number, target: number): number {
  return target > 0 ? (value / target) * 100 : 0
}

// Read-only. Joins today's LIVE meals/foods (the actual current plan)
// against today's food_tracking rows to determine per-meal completion, and
// reads today's daily_tracking row (if any) for the consumed rollup. Never
// writes - a day with no daily_tracking row yet simply shows zero consumed,
// it is never inserted here.
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
    .select('id, name, sort_order, foods(id, calories, protein, carbs, fat)')
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
    const totals = meal.foods.reduce(
      (acc, f) => ({
        calories: acc.calories + Number(f.calories),
        protein: acc.protein + Number(f.protein),
        carbs: acc.carbs + Number(f.carbs),
        fat: acc.fat + Number(f.fat)
      }),
      zeroMacros()
    )
    const completed = meal.foods.length > 0 && meal.foods.every(f => completedFoodIds.has(f.id))
    return { mealId: meal.id, name: meal.name, completed, ...totals }
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

// Marks a meal completed/uncompleted for a given date. Idempotent: upserts
// on the existing (user_id, tracking_date, food_id) unique constraint, so
// double-clicks or repeated requests never create duplicate rows - they
// just overwrite the same row with the same completed value. Only ever
// operates on "today" (within the tolerance window) - past dates are
// rejected, so historical tracking can never be retroactively edited
// through this action.
export async function toggleMealCompletion(
  mealId: string,
  localDate: string,
  completed: boolean
): Promise<Result<DailyTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Tracking is only available for today.' }

  const supabase = await createClient()

  // Ownership check + fresh server-verified macros - the client's own
  // computed totals are never trusted, matching the existing saveDietPlan
  // pattern in app/dashboard/actions.ts.
  const { data: meal } = await supabase
    .from('meals')
    .select('id, name, foods(id, name, quantity, unit, calories, protein, carbs, fat)')
    .eq('id', mealId)
    .eq('user_id', user.id)
    .single()

  if (!meal) return { error: 'Meal not found.' }

  interface FoodRow {
    id: string
    name: string
    quantity: number
    unit: string
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  const foods = (meal.foods as FoodRow[]) || []

  if (foods.length > 0) {
    const nowIso = new Date().toISOString()
    const rows = foods.map(f => ({
      user_id: user.id,
      tracking_date: localDate,
      food_id: f.id,
      meal_id: mealId,
      meal_name: meal.name,
      completed,
      quantity: f.quantity,
      unit: f.unit,
      food_name: f.name,
      protein: f.protein,
      fat: f.fat,
      carbs: f.carbs,
      calories: f.calories,
      updated_at: nowIso
    }))

    const { error: upsertError } = await supabase
      .from('food_tracking')
      .upsert(rows, { onConflict: 'user_id,tracking_date,food_id' })

    if (upsertError) return { error: 'Failed to save completion. Please try again.' }
  }

  // Recompute today's rollup strictly from completed=true rows - a meal
  // that was just unchecked stops contributing the instant its rows flip
  // to completed=false.
  const { data: completedRows, error: sumError } = await supabase
    .from('food_tracking')
    .select('calories, protein, carbs, fat')
    .eq('user_id', user.id)
    .eq('tracking_date', localDate)
    .eq('completed', true)

  if (sumError) return { error: 'Failed to update daily progress. Please try again.' }

  const totals = (completedRows || []).reduce(
    (acc, r) => ({
      calories: acc.calories + Number(r.calories),
      protein: acc.protein + Number(r.protein),
      carbs: acc.carbs + Number(r.carbs),
      fat: acc.fat + Number(r.fat)
    }),
    zeroMacros()
  )

  const { data: activePlans } = await supabase
    .from('diet_plans')
    .select('calories_target, protein_target, carbs_target, fat_target')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activePlan = activePlans?.[0]
  if (!activePlan) return { error: 'No active meal plan found.' }

  const { error: dailyError } = await supabase.from('daily_tracking').upsert(
    {
      user_id: user.id,
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

  if (dailyError) return { error: 'Failed to update daily progress. Please try again.' }

  return getTodayTracking(localDate)
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
