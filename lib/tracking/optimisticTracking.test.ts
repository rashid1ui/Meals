import test from 'node:test'
import assert from 'node:assert'
import type { DailyTrackingSummary } from '@/app/dashboard/tracking-actions'
import {
  initState,
  viewOf,
  savingFoodIdsOf,
  requestFoodLog,
  requestMealToggle,
  settleFoodLog,
  applyOptimisticFoodLog,
  applyOptimisticMealToggle,
  mergeConfirmedFood,
  type Effect,
  type OptimisticState
} from './optimisticTracking'

// A two-meal day. Breakfast: Oats (planned, not eaten) + Peanut Butter
// (planned, not eaten). Snack: Milk (planned, not eaten). Numbers are chosen
// so Breakfast's planned matches the prompt's "ACTUAL 379/13/68/7 -> after
// Peanut Butter 497/18/72/17" example (Oats eaten = 379/13/68/7, PB adds
// 118/5/4/10).
const OATS = {
  foodId: 'oats',
  status: 'none' as const,
  consumedQuantity: 0,
  plannedQuantity: 80,
  planned: { calories: 379, protein: 13, carbs: 68, fat: 7 },
  actual: { calories: 0, protein: 0, carbs: 0, fat: 0 }
}
const PB = {
  foodId: 'pb',
  status: 'none' as const,
  consumedQuantity: 0,
  plannedQuantity: 20,
  planned: { calories: 118, protein: 5, carbs: 4, fat: 10 },
  actual: { calories: 0, protein: 0, carbs: 0, fat: 0 }
}
const MILK = {
  foodId: 'milk',
  status: 'none' as const,
  consumedQuantity: 0,
  plannedQuantity: 250,
  planned: { calories: 160, protein: 8, carbs: 12, fat: 8 },
  actual: { calories: 0, protein: 0, carbs: 0, fat: 0 }
}

function makeSummary(): DailyTrackingSummary {
  return {
    date: '2026-09-03',
    consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    target: { calories: 2400, protein: 180, carbs: 250, fat: 70 },
    meals: [
      {
        mealId: 'breakfast',
        name: 'Breakfast',
        status: 'none',
        foods: [structuredClone(OATS), structuredClone(PB)],
        planned: { calories: 497, protein: 18, carbs: 72, fat: 17 },
        actual: { calories: 0, protein: 0, carbs: 0, fat: 0 }
      },
      {
        mealId: 'snack',
        name: 'Snack',
        status: 'none',
        foods: [structuredClone(MILK)],
        planned: { calories: 160, protein: 8, carbs: 12, fat: 8 },
        actual: { calories: 0, protein: 0, carbs: 0, fat: 0 }
      }
    ],
    proteinBreakdown: { animal: 0, plant: 0, supplement: 0 }
  }
}

const breakfast = (s: DailyTrackingSummary) => s.meals.find(m => m.mealId === 'breakfast')!
const food = (s: DailyTrackingSummary, id: string) =>
  s.meals.flatMap(m => m.foods).find(f => f.foodId === id)!

// --- pure nutrition transforms -------------------------------------------------

test('applyOptimisticFoodLog - eating a food adds exactly its planned macros to the meal Actual and daily consumed', () => {
  const s0 = makeSummary()
  const s1 = applyOptimisticFoodLog(s0, 'breakfast', 'oats', 80)

  assert.strictEqual(food(s1, 'oats').status, 'complete')
  assert.deepStrictEqual(food(s1, 'oats').actual, { calories: 379, protein: 13, carbs: 68, fat: 7 })
  assert.deepStrictEqual(breakfast(s1).actual, { calories: 379, protein: 13, carbs: 68, fat: 7 })
  assert.strictEqual(breakfast(s1).status, 'partial') // oats eaten, PB not
  assert.deepStrictEqual(s1.consumed, { calories: 379, protein: 13, carbs: 68, fat: 7 })
})

test('applyOptimisticFoodLog - matches the prompt example: 379/13/68/7 becomes 497/18/72/17 after Peanut Butter', () => {
  let s = makeSummary()
  s = applyOptimisticFoodLog(s, 'breakfast', 'oats', 80)
  s = applyOptimisticFoodLog(s, 'breakfast', 'pb', 20)

  assert.deepStrictEqual(breakfast(s).actual, { calories: 497, protein: 18, carbs: 72, fat: 17 })
  assert.strictEqual(breakfast(s).status, 'complete')
  assert.deepStrictEqual(s.consumed, { calories: 497, protein: 18, carbs: 72, fat: 17 })
  // progress % the card renders = actual.calories / meal target
  assert.strictEqual(Math.round((breakfast(s).actual.calories / breakfast(s).planned.calories) * 100), 100)
})

test('applyOptimisticFoodLog - a partial quantity scales macros proportionally, status is partial', () => {
  const s = applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 40) // half
  assert.strictEqual(food(s, 'oats').status, 'partial')
  assert.deepStrictEqual(food(s, 'oats').actual, { calories: 189.5, protein: 6.5, carbs: 34, fat: 3.5 })
})

test('applyOptimisticFoodLog - un-marking (quantity 0) returns the food and totals to zero', () => {
  let s = applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 80)
  s = applyOptimisticFoodLog(s, 'breakfast', 'oats', 0)
  assert.strictEqual(food(s, 'oats').status, 'none')
  assert.deepStrictEqual(s.consumed, { calories: 0, protein: 0, carbs: 0, fat: 0 })
  assert.strictEqual(breakfast(s).status, 'none')
})

test('applyOptimisticFoodLog - eating MORE than planned is recorded as-is (target is not a ceiling), macros scale past 100%', () => {
  const s = applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 120) // planned 80 -> 1.5x
  assert.strictEqual(food(s, 'oats').consumedQuantity, 120)
  assert.strictEqual(food(s, 'oats').status, 'complete') // still 'complete', never a 4th state
  assert.deepStrictEqual(food(s, 'oats').actual, { calories: 568.5, protein: 19.5, carbs: 102, fat: 10.5 })
  // the meal Actual and daily consumed reflect the over-eating, not a capped 100%
  assert.strictEqual(breakfast(s).actual.calories, 568.5)
  assert.strictEqual(s.consumed.calories, 568.5)
})

test('applyOptimisticFoodLog - an absurd over-large quantity is still bounded to a sane multiple of planned (never a 4th state)', () => {
  const s = applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 99999)
  assert.strictEqual(food(s, 'oats').consumedQuantity, 800) // 80 planned x MAX_CONSUMED_PLANNED_MULTIPLE (10)
  assert.strictEqual(food(s, 'oats').status, 'complete')
})

test('applyOptimisticFoodLog - leaves other meals/foods byte-identical (isolation)', () => {
  const s0 = makeSummary()
  const s1 = applyOptimisticFoodLog(s0, 'breakfast', 'oats', 80)
  assert.deepStrictEqual(s1.meals.find(m => m.mealId === 'snack'), s0.meals.find(m => m.mealId === 'snack'))
  assert.deepStrictEqual(food(s1, 'pb'), food(s0, 'pb'))
})

test('applyOptimisticFoodLog - unknown meal or food id is a no-op that returns the same reference', () => {
  const s0 = makeSummary()
  assert.strictEqual(applyOptimisticFoodLog(s0, 'lunch', 'oats', 50), s0)
  assert.strictEqual(applyOptimisticFoodLog(s0, 'breakfast', 'ghost', 50), s0)
})

test('applyOptimisticMealToggle - marks every food in the meal eaten, leaves the other meal alone', () => {
  const s0 = makeSummary()
  const s1 = applyOptimisticMealToggle(s0, 'breakfast', true)
  assert.strictEqual(breakfast(s1).status, 'complete')
  assert.ok(breakfast(s1).foods.every(f => f.status === 'complete'))
  assert.deepStrictEqual(s1.meals.find(m => m.mealId === 'snack'), s0.meals.find(m => m.mealId === 'snack'))
  assert.deepStrictEqual(s1.consumed, { calories: 497, protein: 18, carbs: 72, fat: 17 })
})

// --- transition system -------------------------------------------------------

function drain(step: { state: OptimisticState; effects: Effect[] }) {
  return step
}

test('requestFoodLog - the view updates synchronously, before any persist resolves', () => {
  const state = initState(makeSummary())
  const { state: next, effects } = requestFoodLog(state, 'oats', { mealId: 'breakfast', consumedQuantity: 80 })

  // UI is already showing the change...
  assert.strictEqual(food(viewOf(next), 'oats').status, 'complete')
  assert.deepStrictEqual(viewOf(next).consumed, { calories: 379, protein: 13, carbs: 68, fat: 7 })
  // ...while the persist has only just been requested (not awaited).
  assert.deepStrictEqual(effects, [{ type: 'persist', foodId: 'oats', intent: { mealId: 'breakfast', consumedQuantity: 80 } }])
  assert.strictEqual(next.confirmed.consumed.calories, 0, 'confirmed state is untouched until the server answers')
  assert.deepStrictEqual([...savingFoodIdsOf(next)], ['oats'])
})

test('settleFoodLog success - keeps the optimistic value and clears the saving hint', () => {
  let step = requestFoodLog(initState(makeSummary()), 'oats', { mealId: 'breakfast', consumedQuantity: 80 })
  // server returns a snapshot that agrees with the optimistic guess
  const serverSnapshot = applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 80)
  step = settleFoodLog(step.state, 'oats', { data: serverSnapshot })

  assert.deepStrictEqual(step.effects, [])
  assert.strictEqual(food(viewOf(step.state), 'oats').status, 'complete')
  assert.strictEqual(step.state.confirmed.consumed.calories, 379, 'confirmed advanced to the server snapshot')
  assert.strictEqual(savingFoodIdsOf(step.state).size, 0)
})

test('settleFoodLog failure - rolls back ONLY the failed food, every other optimistic change stays', () => {
  let step = requestFoodLog(initState(makeSummary()), 'oats', { mealId: 'breakfast', consumedQuantity: 80 })
  step = drain(requestFoodLog(step.state, 'milk', { mealId: 'snack', consumedQuantity: 250 }))
  step = drain(requestFoodLog(step.state, 'pb', { mealId: 'breakfast', consumedQuantity: 20 }))

  // the oats write fails
  step = settleFoodLog(step.state, 'oats', { error: 'Failed to save completion. Please try again.' })

  assert.deepStrictEqual(step.effects, [{ type: 'error', message: 'Failed to save completion. Please try again.' }])
  const v = viewOf(step.state)
  assert.strictEqual(food(v, 'oats').status, 'none', 'oats rolled back')
  assert.strictEqual(food(v, 'pb').status, 'complete', 'pb still optimistic')
  assert.strictEqual(food(v, 'milk').status, 'complete', 'milk still optimistic')
  assert.strictEqual(food(v, 'pb').actual.calories, 118)
  // daily total reflects pb + milk, not oats
  assert.deepStrictEqual(v.consumed, { calories: 278, protein: 13, carbs: 16, fat: 18 })
})

test('rapid clicks on three different foods - the view reflects all three at once, one persist each', () => {
  let step = requestFoodLog(initState(makeSummary()), 'oats', { mealId: 'breakfast', consumedQuantity: 80 })
  const e1 = step.effects
  step = requestFoodLog(step.state, 'pb', { mealId: 'breakfast', consumedQuantity: 20 })
  const e2 = step.effects
  step = requestFoodLog(step.state, 'milk', { mealId: 'snack', consumedQuantity: 250 })
  const e3 = step.effects

  const v = viewOf(step.state)
  assert.ok(['oats', 'pb', 'milk'].every(id => food(v, id).status === 'complete'))
  assert.deepStrictEqual(v.consumed, { calories: 657, protein: 26, carbs: 84, fat: 25 })
  assert.strictEqual(e1.length + e2.length + e3.length, 3, 'exactly one persist queued per distinct food')
})

test('double-click the same food (eat then immediately un-eat) - only one call in flight at a time, final intent wins, no duplicate persist', () => {
  const persists: Effect[] = []
  // click 1: eat
  let step = requestFoodLog(initState(makeSummary()), 'oats', { mealId: 'breakfast', consumedQuantity: 80 })
  persists.push(...step.effects)
  assert.strictEqual(step.effects.length, 1)

  // click 2: un-eat, while click 1's persist is still running
  step = requestFoodLog(step.state, 'oats', { mealId: 'breakfast', consumedQuantity: 0 })
  assert.deepStrictEqual(step.effects, [], 'no second concurrent persist for the same food')
  assert.strictEqual(food(viewOf(step.state), 'oats').status, 'none', 'UI already shows the latest (un-eaten) intent')

  // click 1 resolves -> the queued un-eat intent is sent now
  step = settleFoodLog(step.state, 'oats', { data: applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 80) })
  assert.deepStrictEqual(step.effects, [{ type: 'persist', foodId: 'oats', intent: { mealId: 'breakfast', consumedQuantity: 0 } }])
  persists.push(...step.effects)

  // that final write resolves
  step = settleFoodLog(step.state, 'oats', { data: makeSummary() })
  assert.deepStrictEqual(step.effects, [])
  assert.strictEqual(food(viewOf(step.state), 'oats').status, 'none', 'final state is the last intent: not eaten')
  assert.strictEqual(savingFoodIdsOf(step.state).size, 0)
  assert.strictEqual(persists.length, 2, 'two sequential writes, never two at once')
})

test('settleFoodLog - a stale response for one food never regresses a sibling that already settled', () => {
  // oats and milk both clicked; milk settles first from its own authoritative
  // snapshot; then oats settles from a snapshot taken BEFORE milk's write was
  // visible (its meals show milk as not eaten). Milk must stay eaten.
  let step = requestFoodLog(initState(makeSummary()), 'oats', { mealId: 'breakfast', consumedQuantity: 80 })
  step = drain(requestFoodLog(step.state, 'milk', { mealId: 'snack', consumedQuantity: 250 }))

  step = settleFoodLog(step.state, 'milk', { data: applyOptimisticFoodLog(makeSummary(), 'snack', 'milk', 250) })
  const staleOatsSnapshot = applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 80) // milk NOT in it
  step = settleFoodLog(step.state, 'oats', { data: staleOatsSnapshot })

  const v = viewOf(step.state)
  assert.strictEqual(food(v, 'milk').status, 'complete', 'sibling milk not clobbered by the stale oats snapshot')
  assert.strictEqual(food(v, 'oats').status, 'complete')
  assert.deepStrictEqual(v.consumed, { calories: 539, protein: 21, carbs: 80, fat: 15 })
})

test('requestMealToggle - marks the whole meal eaten in the view and queues one persist per food', () => {
  const { state, effects } = requestMealToggle(initState(makeSummary()), 'breakfast', true)
  const v = viewOf(state)
  assert.strictEqual(breakfast(v).status, 'complete')
  assert.deepStrictEqual(
    effects.flatMap(e => (e.type === 'persist' ? [e.foodId] : [])).sort(),
    ['oats', 'pb']
  )
  assert.deepStrictEqual(breakfast(v).actual, { calories: 497, protein: 18, carbs: 72, fat: 17 })
})

test('mergeConfirmedFood - drift-safe: a food missing from base is ignored', () => {
  const base = makeSummary()
  const snap = applyOptimisticFoodLog(makeSummary(), 'breakfast', 'oats', 80)
  assert.strictEqual(mergeConfirmedFood(base, snap, 'not-a-real-food'), base)
})
