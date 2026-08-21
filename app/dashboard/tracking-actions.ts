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
  computeFoodStatus,
  deriveMealStatus,
  computeActualFoodMacros,
  sumMacros,
  zeroMacros,
  pctOf,
  buildFoodTrackingRow,
  type TrackingStatus,
  type TrackableFood,
  type MacroTotals
} from '@/lib/tracking/logic'

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
  completed: boolean
  quantity: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Read-only. Joins today's LIVE meals/foods (the actual current plan)
// against today's food_tracking rows to determine per-meal/per-food
// completion AND actual consumed quantity/macros, and reads today's
// daily_tracking row (if any) for the consumed rollup. Never writes - a day
// with no daily_tracking row yet simply shows zero consumed, it is never
// inserted here.
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
    .select('food_id, completed, quantity, calories, protein, carbs, fat')
    .eq('user_id', user.id)
    .eq('tracking_date', localDate)

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
// food_tracking rows (each already storing its own ACTUAL consumed
// quantity/macros, whether that's a full or partial portion), upserts it,
// then returns the fresh full state. Shared by both logging actions below so
// the rollup logic exists in exactly one place. Never sums planned/meal
// totals - only ever what's actually been logged as eaten.
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
