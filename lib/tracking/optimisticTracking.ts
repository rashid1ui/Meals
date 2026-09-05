// Pure, framework-free optimistic-update core for meal tracking - no React,
// no Supabase, no 'use server'. The client counterpart to
// app/dashboard/tracking-actions.ts's server writes.
//
// The problem this solves: clicking a food used to `await` a server action
// (a food_tracking upsert, a daily_tracking recompute, then a full
// getTodayTracking re-fetch - ~10 sequential round trips) BEFORE the
// checkmark, the meal Actual totals, the progress bar or the daily totals
// moved at all. Every rendered number was derived straight from the server
// response, so the whole card sat behind a spinner until the DB answered.
//
// Here the click updates a local overlay SYNCHRONOUSLY and the persist runs
// in the background; the overlay entry is dropped only once that food's own
// server write comes back (keep the optimistic value) or fails (roll back
// just that one food). The same nutrition helpers the server uses
// (computeActualFoodMacros / computeFoodStatus / deriveMealStatus /
// sumMacros) compute the optimistic numbers, so an optimistic apply and the
// eventual server snapshot converge on identical values.
//
// This module is a pure transition system: every function takes state and
// returns the next state plus a list of Effects for the caller
// (DietEditor.tsx) to actually run. That keeps rapid-click ordering,
// per-food serialization and rollback unit-testable with plain fakes.

import type {
  DailyTrackingSummary,
  FoodTrackingState,
  MealCompletionState
} from '@/app/dashboard/tracking-actions'
import {
  boundConsumedQuantity,
  computeActualFoodMacros,
  computeFoodStatus,
  deriveMealStatus,
  sumMacros,
  type MacroTotals
} from './logic'

export interface FoodIntent {
  mealId: string
  // Canonical grams/ml actually eaten - 0 means "not eaten" (un-mark).
  consumedQuantity: number
}

// The single source of truth the UI renders from is `viewOf(state)`:
// `confirmed` (the last server-verified snapshot) with every still-unconfirmed
// optimistic intent in `overlay` folded on top.
export interface OptimisticState {
  confirmed: DailyTrackingSummary
  // foodId -> the latest optimistic intent for that food that the server has
  // not yet confirmed. Last-write-wins: a second click on the same food
  // before the first persist returns just replaces this entry.
  overlay: ReadonlyMap<string, FoodIntent>
  // foodId -> a persist call for that food is in flight right now. At most
  // one persist per food is ever outstanding, so writes for a given food
  // land in click order and an out-of-order response can't resurrect a
  // stale value.
  running: ReadonlySet<string>
  // foodId -> an intent that arrived while a persist for that food was in
  // flight, to be sent the moment the current one resolves.
  trailing: ReadonlyMap<string, FoodIntent>
}

export type Effect =
  | { type: 'persist'; foodId: string; intent: FoodIntent }
  | { type: 'error'; message: string }

export function initState(confirmed: DailyTrackingSummary): OptimisticState {
  return { confirmed, overlay: new Map(), running: new Set(), trailing: new Map() }
}

// foodIds that have an unsaved change in flight - drives the subtle per-food
// "saving" hint. Never blocks interaction.
export function savingFoodIdsOf(state: OptimisticState): ReadonlySet<string> {
  return new Set(state.overlay.keys())
}

// ---------------------------------------------------------------------------
// Pure summary transforms (also exported for direct unit testing)
// ---------------------------------------------------------------------------

function recomputeMeal(meal: MealCompletionState): MealCompletionState {
  return {
    ...meal,
    status: deriveMealStatus(meal.foods.map(f => f.status)),
    actual: sumMacros(meal.foods.map(f => f.actual))
  }
}

function recomputeConsumed(meals: MealCompletionState[]): MacroTotals {
  // Mirrors the server's recomputeDailyAndReturn: the daily rollup is the
  // sum of every actually-eaten food's macros, nothing planned.
  return sumMacros(meals.flatMap(m => m.foods.map(f => f.actual)))
}

// Recompute one food's state from a new consumed quantity, exactly as
// logFoodConsumption + getTodayTracking would on the server: bound to
// [0, MAX_CONSUMED_PLANNED_MULTIPLE x planned] (planned is a target, not a
// ceiling - eating more than planned is recorded as-is), scale macros
// linearly, re-derive the food and meal status, re-sum the meal Actual and
// the daily consumed totals. A no-op (returns the same reference) when the
// meal/food isn't in this summary, so it can never touch another user's /
// date's / meal's data.
export function applyOptimisticFoodLog(
  summary: DailyTrackingSummary,
  mealId: string,
  foodId: string,
  consumedQuantity: number
): DailyTrackingSummary {
  let touched = false
  const meals = summary.meals.map(meal => {
    if (meal.mealId !== mealId) return meal
    const foods = meal.foods.map(food => {
      if (food.foodId !== foodId) return food
      const clamped = boundConsumedQuantity(consumedQuantity, food.plannedQuantity)
      const actual = computeActualFoodMacros(clamped, {
        id: food.foodId,
        name: '',
        quantity: food.plannedQuantity,
        calories: food.planned.calories,
        protein: food.planned.protein,
        carbs: food.planned.carbs,
        fat: food.planned.fat
      })
      touched = true
      return {
        ...food,
        consumedQuantity: clamped,
        status: computeFoodStatus(clamped, food.plannedQuantity),
        actual
      }
    })
    return recomputeMeal({ ...meal, foods })
  })
  if (!touched) return summary
  return { ...summary, meals, consumed: recomputeConsumed(meals) }
}

// "I ate this whole meal" / "undo that" - fans the per-food transform out
// over every food in the meal at its full planned quantity (or zero).
export function applyOptimisticMealToggle(
  summary: DailyTrackingSummary,
  mealId: string,
  completed: boolean
): DailyTrackingSummary {
  const meal = summary.meals.find(m => m.mealId === mealId)
  if (!meal) return summary
  return meal.foods.reduce(
    (acc, food) =>
      applyOptimisticFoodLog(acc, mealId, food.foodId, completed ? food.plannedQuantity : 0),
    summary
  )
}

function findFood(
  summary: DailyTrackingSummary,
  foodId: string
): { mealId: string; food: FoodTrackingState } | null {
  for (const meal of summary.meals) {
    const food = meal.foods.find(f => f.foodId === foodId)
    if (food) return { mealId: meal.mealId, food }
  }
  return null
}

// Adopt the server's confirmed state for ONE food from a fresh snapshot,
// leaving every other food/meal in `base` untouched, then re-derive that
// food's meal and the daily totals. Deliberately per-food rather than a
// wholesale replace: during a burst of clicks a given response may have read
// the DB before a sibling food's concurrent write committed, so trusting it
// for the whole day could visually regress a sibling that already settled
// from its own (authoritative) response. Per-food serialization guarantees
// the snapshot handed here always includes THIS food's write.
export function mergeConfirmedFood(
  base: DailyTrackingSummary,
  snapshot: DailyTrackingSummary,
  foodId: string
): DailyTrackingSummary {
  const fromSnap = findFood(snapshot, foodId)
  const inBase = findFood(base, foodId)
  if (!fromSnap || !inBase) return base

  const meals = base.meals.map(meal => {
    if (meal.mealId !== inBase.mealId) return meal
    const foods = meal.foods.map(f => (f.foodId === foodId ? fromSnap.food : f))
    return recomputeMeal({ ...meal, foods })
  })
  return {
    ...base,
    meals,
    consumed: recomputeConsumed(meals),
    // Not rendered in the meal-tracking view; adopt the latest server value
    // so the Insights protein split converges without a dedicated recompute.
    proteinBreakdown: snapshot.proteinBreakdown
  }
}

// ---------------------------------------------------------------------------
// Transition system
// ---------------------------------------------------------------------------

// The user clicked a food (directly, or as one food of a meal toggle).
// Always records the intent in the overlay (instant UI); emits a `persist`
// effect only if no call for this food is already in flight - otherwise the
// intent waits in `trailing`.
export function requestFoodLog(
  state: OptimisticState,
  foodId: string,
  intent: FoodIntent
): { state: OptimisticState; effects: Effect[] } {
  const overlay = new Map(state.overlay).set(foodId, intent)

  if (state.running.has(foodId)) {
    const trailing = new Map(state.trailing).set(foodId, intent)
    return { state: { ...state, overlay, trailing }, effects: [] }
  }

  const running = new Set(state.running).add(foodId)
  return {
    state: { ...state, overlay, running },
    effects: [{ type: 'persist', foodId, intent }]
  }
}

// Fan a meal-level toggle out over its foods, threading state through
// requestFoodLog so per-food serialization and rollback are identical to a
// direct food click. Uses the CURRENT view so it reads live planned
// quantities and any already-optimistic siblings.
export function requestMealToggle(
  state: OptimisticState,
  mealId: string,
  completed: boolean
): { state: OptimisticState; effects: Effect[] } {
  const meal = viewOf(state).meals.find(m => m.mealId === mealId)
  if (!meal) return { state, effects: [] }

  let next = state
  const effects: Effect[] = []
  for (const food of meal.foods) {
    const step = requestFoodLog(next, food.foodId, {
      mealId,
      consumedQuantity: completed ? food.plannedQuantity : 0
    })
    next = step.state
    effects.push(...step.effects)
  }
  return { state: next, effects }
}

// A persist call for `foodId` resolved. On success the food's optimistic
// value is kept (its overlay entry is dropped and `confirmed` is advanced
// from the snapshot). On failure ONLY that food rolls back - every other
// optimistic change stays. Either way, any intent that queued up in
// `trailing` while this call was in flight is sent now.
export function settleFoodLog(
  state: OptimisticState,
  foodId: string,
  result: { data: DailyTrackingSummary } | { error: string }
): { state: OptimisticState; effects: Effect[] } {
  const ok = 'data' in result
  const confirmed = ok ? mergeConfirmedFood(state.confirmed, result.data, foodId) : state.confirmed

  const trailingIntent = state.trailing.get(foodId)
  if (trailingIntent) {
    // A newer click landed mid-flight: keep this food "running", keep its
    // overlay entry, and fire the queued intent. The just-resolved (older)
    // response is still folded into `confirmed` on success so sibling foods
    // benefit, but this food stays optimistic until its final write lands.
    const trailing = new Map(state.trailing)
    trailing.delete(foodId)
    return {
      state: { ...state, confirmed, trailing },
      effects: [{ type: 'persist', foodId, intent: trailingIntent }]
    }
  }

  const running = new Set(state.running)
  running.delete(foodId)
  const overlay = new Map(state.overlay)
  overlay.delete(foodId)

  if (!ok) {
    return {
      state: { ...state, running, overlay },
      effects: [{ type: 'error', message: result.error }]
    }
  }
  return { state: { confirmed, overlay, running, trailing: state.trailing }, effects: [] }
}

// What the UI renders: the confirmed snapshot with every unconfirmed
// optimistic intent folded on top.
export function viewOf(state: OptimisticState): DailyTrackingSummary {
  let summary = state.confirmed
  for (const [foodId, intent] of state.overlay) {
    summary = applyOptimisticFoodLog(summary, intent.mealId, foodId, intent.consumedQuantity)
  }
  return summary
}
