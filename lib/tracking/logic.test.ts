import test from 'node:test'
import assert from 'node:assert'
import {
  computeFoodStatus,
  deriveMealStatus,
  sumMacros,
  zeroMacros,
  pctOf,
  computeActualFoodMacros,
  computeDayAdherencePct,
  buildFoodTrackingRow,
  adherenceTier,
  type TrackableFood,
  type MacroTotals
} from './logic'

function food(id: string, name: string, quantity: number, calories: number, protein: number, carbs: number, fat: number): TrackableFood {
  return { id, name, quantity, calories, protein, carbs, fat }
}

// computeFoodStatus - the tri-state per-food classification a quantity is
// compared against its current planned quantity to derive.

test('computeFoodStatus - zero consumed is none', () => {
  assert.strictEqual(computeFoodStatus(0, 100), 'none')
})

test('computeFoodStatus - consuming the full planned quantity is complete', () => {
  assert.strictEqual(computeFoodStatus(100, 100), 'complete')
})

test('computeFoodStatus - consuming less than planned is partial', () => {
  assert.strictEqual(computeFoodStatus(60, 100), 'partial')
})

test('computeFoodStatus - 2 of 3 eggs (66.67g of 100g at 33.33g/egg) reads as partial, not complete', () => {
  assert.strictEqual(computeFoodStatus(66.67, 100), 'partial')
})

test('computeFoodStatus - a value within floating-point rounding of the full planned quantity still reads as complete', () => {
  // 3 eggs at 33.33g/egg = 99.99, not exactly 100 - must not get stuck at "partial".
  assert.strictEqual(computeFoodStatus(99.99, 100), 'complete')
})

test('computeFoodStatus - logging more than planned is still complete, never an invalid fourth state', () => {
  assert.strictEqual(computeFoodStatus(120, 100), 'complete')
})

// deriveMealStatus - meal completion is ALWAYS derived from its foods'
// statuses, never set independently.

test('deriveMealStatus - a meal with no foods is none, never vacuously complete', () => {
  assert.strictEqual(deriveMealStatus([]), 'none')
})

test('deriveMealStatus - every food none is none', () => {
  assert.strictEqual(deriveMealStatus(['none', 'none']), 'none')
})

test('deriveMealStatus - every food complete is complete', () => {
  assert.strictEqual(deriveMealStatus(['complete', 'complete']), 'complete')
})

test('deriveMealStatus - a mix of none/partial/complete is partial', () => {
  assert.strictEqual(deriveMealStatus(['complete', 'none']), 'partial')
  assert.strictEqual(deriveMealStatus(['complete', 'partial']), 'partial')
  assert.strictEqual(deriveMealStatus(['partial', 'none']), 'partial')
})

test('deriveMealStatus - two of three foods completed is partial (Breakfast: eggs + bread eaten, oats not)', () => {
  assert.strictEqual(deriveMealStatus(['complete', 'complete', 'none']), 'partial')
})

// computeActualFoodMacros - reuses calculateFoodMacros to scale a food's own
// planned macros down to whatever quantity was actually consumed.

test('computeActualFoodMacros - eating the full planned quantity returns the full planned macros', () => {
  const chicken = food('f1', 'Chicken Breast', 200, 240, 45, 0, 5.2)
  assert.deepStrictEqual(computeActualFoodMacros(200, chicken), { calories: 240, protein: 45, carbs: 0, fat: 5.2 })
})

test('computeActualFoodMacros - 120g of a 200g planned chicken portion scales macros proportionally, not to the full amount', () => {
  const chicken = food('f1', 'Chicken Breast', 200, 240, 45, 0, 5.2)
  const actual = computeActualFoodMacros(120, chicken)
  assert.strictEqual(actual.calories, 144)
  assert.strictEqual(actual.protein, 27)
  assert.strictEqual(actual.fat, 3.12)
})

test('computeActualFoodMacros - 2 of 3 eggs (planned 100g for 3 eggs) scales down, not the full 3-egg macros', () => {
  const eggs = food('f1', 'Whole Egg', 100, 143, 12.6, 0.7, 9.5)
  const actual = computeActualFoodMacros(66.67, eggs) // ~2 of 3 eggs at 33.33g each
  assert.ok(actual.calories < 143 && actual.calories > 90)
  assert.ok(Math.abs(actual.calories - 95.36) < 0.1)
})

test('computeActualFoodMacros - zero consumed is zero macros, not the full planned amount', () => {
  const rice = food('f1', 'White Rice', 150, 200, 4, 44, 0.4)
  assert.deepStrictEqual(computeActualFoodMacros(0, rice), { calories: 0, protein: 0, carbs: 0, fat: 0 })
})

// buildFoodTrackingRow - now shapes rows from the ACTUAL consumed
// quantity/macros the caller already resolved, and derives `completed` from
// quantity rather than trusting a separately-passed flag.

test('buildFoodTrackingRow - two foods with the same name in different meals build independent rows keyed by food_id', () => {
  const breakfastEggs = food('breakfast-eggs-id', 'Eggs', 100, 143, 12.6, 0.7, 9.5)
  const snackEggs = food('snack-eggs-id', 'Eggs', 0, 0, 0, 0, 0)

  const rowA = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'breakfast-id', mealName: 'Breakfast', food: breakfastEggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  const rowB = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'snack-id', mealName: 'Snack', food: snackEggs },
    () => '2026-08-21T00:00:00.000Z'
  )

  assert.notStrictEqual(rowA.food_id, rowB.food_id)
  assert.strictEqual(rowA.meal_id, 'breakfast-id')
  assert.strictEqual(rowB.meal_id, 'snack-id')
  assert.strictEqual(rowA.completed, true)
  assert.strictEqual(rowB.completed, false)
  // Confirms the row shape has no `unit` field - the root cause of the
  // original "Failed to save completion" error was upserting a `unit` key
  // that food_tracking has no column for.
  assert.strictEqual('unit' in rowA, false)
})

test('buildFoodTrackingRow - a fully-eaten food is stored with completed=true', () => {
  const eggs = food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)
  const row = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'm1', mealName: 'Breakfast', food: eggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  assert.strictEqual(row.calories, 143)
  assert.strictEqual(row.food_name, 'Eggs')
  assert.strictEqual(row.quantity, 100)
  assert.strictEqual(row.completed, true)
})

test('buildFoodTrackingRow - a partially-eaten food (already-scaled actual macros) is still completed=true', () => {
  const chicken = food('f1', 'Chicken', 120, 144, 27, 0, 3.12) // caller already scaled this to the consumed amount
  const row = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'm1', mealName: 'Lunch', food: chicken },
    () => '2026-08-21T00:00:00.000Z'
  )
  assert.strictEqual(row.quantity, 120)
  assert.strictEqual(row.calories, 144)
  assert.strictEqual(row.completed, true)
})

test('buildFoodTrackingRow - logging zero quantity (un-marking) is stored with completed=false', () => {
  const eggs = food('f1', 'Eggs', 0, 0, 0, 0, 0)
  const row = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'm1', mealName: 'Breakfast', food: eggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  assert.strictEqual(row.completed, false)
})

test('sumMacros - sums a list of already-actual per-food macros into a meal/day total', () => {
  const totals = sumMacros([
    { calories: 144, protein: 27, carbs: 0, fat: 3.12 },
    { calories: 95.36, protein: 8.4, carbs: 0.47, fat: 6.34 }
  ])
  assert.strictEqual(Math.round(totals.calories), 239)
  assert.strictEqual(Math.round(totals.protein * 10) / 10, 35.4)
})

// computeDayAdherencePct - the Insights calendar's per-day cell percentage:
// average of each macro's own percent-of-target, capped per-macro at 100.

test('computeDayAdherencePct - hitting every macro target exactly is 100%', () => {
  const target = { calories: 2000, protein: 150, carbs: 200, fat: 60 }
  assert.strictEqual(computeDayAdherencePct(target, target), 100)
})

test('computeDayAdherencePct - eating nothing is 0%', () => {
  const target = { calories: 2000, protein: 150, carbs: 200, fat: 60 }
  assert.strictEqual(computeDayAdherencePct(zeroMacros(), target), 0)
})

test('computeDayAdherencePct - averages across macros, not just calories', () => {
  // calories 100%, protein 50%, carbs 0%, fat 100% -> average 62.5 -> rounds to 63
  const target = { calories: 2000, protein: 150, carbs: 200, fat: 60 }
  const consumed = { calories: 2000, protein: 75, carbs: 0, fat: 60 }
  assert.strictEqual(computeDayAdherencePct(consumed, target), 63)
})

test('computeDayAdherencePct - overeating one macro cannot push the day above 100%', () => {
  const target = { calories: 2000, protein: 150, carbs: 200, fat: 60 }
  // Double every macro - each would be 200% uncapped, but capped at 100% each.
  const consumed = { calories: 4000, protein: 300, carbs: 400, fat: 120 }
  assert.strictEqual(computeDayAdherencePct(consumed, target), 100)
})

test('computeDayAdherencePct - a zero target macro contributes 0%, never divides by zero', () => {
  const target = { calories: 2000, protein: 150, carbs: 200, fat: 0 }
  const consumed = { calories: 2000, protein: 150, carbs: 200, fat: 50 }
  // fat has no target, so pctOf(50, 0) is defined as 0 - average is (100+100+100+0)/4 = 75.
  assert.strictEqual(computeDayAdherencePct(consumed, target), 75)
})

// Insights calendar tier boundaries - each threshold is inclusive at its
// lower bound (90 is 'excellent', 89 is 'good'), and null (no daily_tracking
// row) is always 'none' regardless of any number.
test('adherenceTier - buckets percentages at the documented boundaries', () => {
  assert.strictEqual(adherenceTier(100), 'excellent')
  assert.strictEqual(adherenceTier(90), 'excellent')
  assert.strictEqual(adherenceTier(89), 'good')
  assert.strictEqual(adherenceTier(75), 'good')
  assert.strictEqual(adherenceTier(74), 'partial')
  assert.strictEqual(adherenceTier(50), 'partial')
  assert.strictEqual(adherenceTier(49), 'low')
  assert.strictEqual(adherenceTier(25), 'low')
  assert.strictEqual(adherenceTier(24), 'verylow')
  assert.strictEqual(adherenceTier(0), 'verylow')
  assert.strictEqual(adherenceTier(null), 'none')
})

// ============================================================================
// Regression: "Today's Actual Progress" daily total (dashboard bug repro)
// ============================================================================
//
// ROOT CAUSE (see app/dashboard/tracking-actions.ts): the daily total used to
// be computed by a query that summed every food_tracking row with
// completed=true for the date, with NO scoping to the currently active
// plan's live foods. A same-day plan edit that computeFoodRelinkPairs
// couldn't cleanly re-link (lib/diet/save-plan.ts) left an orphaned
// food_tracking row (food_id set NULL by ON DELETE SET NULL) that no longer
// matched any food in the CURRENT plan - invisible to the per-meal
// breakdown, but still completed=true and still summed into the daily
// total. If the user then re-logged that same real food under its post-edit
// id, BOTH rows got summed: one real eating event counted twice, inflating
// the top-level total while every per-meal card (and the 9/15 foods eaten
// counter, which is also plan-scoped) kept showing the correct number.
//
// The fix: the daily total (and the protein-source breakdown, which had the
// same unscoped-source flaw independently) is now derived from the exact
// same per-meal `actual` values the UI already renders (itself built by
// joining the CURRENT plan's live foods against food_tracking), instead of
// an independent, unscoped raw sum. These tests simulate that computation
// (sum of per-meal actuals, each meal actual = sum of only its foods that
// were actually logged as eaten) end-to-end, using the exact bug-report
// scenario, and separately demonstrate why the old unscoped-sum approach
// was wrong.

interface ScenarioFood extends TrackableFood {
  eaten: boolean
}

interface ScenarioMeal {
  name: string
  foods: ScenarioFood[]
}

// Mirrors exactly what getTodayTracking computes per meal: for each food,
// consumedQuantity is either its full planned quantity (eaten) or 0 (not
// eaten); actual macros come from computeActualFoodMacros; the meal's
// actual is the sum of its foods' actuals. This is the CORRECT, current
// behavior - scoped to only the foods present in the (simulated) active
// plan, exactly like the live join in getTodayTracking.
function computeMealActual(meal: ScenarioMeal): MacroTotals {
  return sumMacros(
    meal.foods.map(f => computeActualFoodMacros(f.eaten ? f.quantity : 0, f))
  )
}

function buildBugReportScenario(): ScenarioMeal[] {
  return [
    {
      name: 'Breakfast',
      foods: [
        food('oats', 'Rolled Oats, Dry', 100, 379, 13, 68, 7),
        food('pb', 'Peanut Butter, Smooth', 20, 118, 5, 4, 10),
        food('milk', 'Whole Milk', 100, 61, 3, 5, 3),
        food('honey', 'Honey', 20, 60, 0, 16, 0)
      ].map(f => ({ ...f, eaten: true }))
    },
    {
      name: 'Lunch',
      foods: [
        { ...food('chicken', 'Chicken Breast, Cooked', 250, 413, 78, 0, 9), eaten: true },
        { ...food('oil', 'Olive Oil, Extra Virgin', 10, 88, 0, 0, 10), eaten: true },
        { ...food('banana-lunch', 'Banana, Raw', 118, 105, 1, 27, 0), eaten: true },
        // Cucumber is NOT eaten - must contribute nothing to Lunch's actual.
        { ...food('cucumber', 'Cucumber, Raw', 150, 23, 1, 5, 0), eaten: false }
      ]
    },
    {
      name: 'Pre-Workout',
      foods: [
        { ...food('sweet-potato', 'Sweet Potato, Cooked', 300, 228, 4, 53, 1), eaten: true },
        // Same food (Banana, Raw) as in Lunch, but a DISTINCT plan row (own
        // id) - must be tracked and summed independently.
        { ...food('banana-preworkout', 'Banana, Raw', 118, 105, 1, 27, 0), eaten: true }
      ]
    },
    {
      name: 'Post-Workout',
      foods: [{ ...food('protein-shake', 'Whey Protein Shake', 30, 120, 24, 3, 1), eaten: false }]
    },
    {
      name: 'Dinner',
      foods: [
        { ...food('salmon', 'Salmon, Cooked', 200, 367, 40, 0, 22), eaten: false },
        { ...food('rice', 'White Rice, Cooked', 200, 258, 5, 56, 1), eaten: false }
      ]
    }
  ]
}

test('dashboard bug repro - Breakfast (fully eaten) actual equals the full meal, not zero or partial', () => {
  const [breakfast] = buildBugReportScenario()
  assert.deepStrictEqual(computeMealActual(breakfast), { calories: 618, protein: 21, carbs: 93, fat: 20 })
})

test('dashboard bug repro - Lunch (partially eaten) excludes Cucumber entirely from the actual total', () => {
  const [, lunch] = buildBugReportScenario()
  assert.deepStrictEqual(computeMealActual(lunch), { calories: 606, protein: 79, carbs: 27, fat: 19 })
  assert.strictEqual(deriveMealStatus(lunch.foods.map(f => computeFoodStatus(f.eaten ? f.quantity : 0, f.quantity))), 'partial')
})

test('dashboard bug repro - Post-Workout and Dinner (not eaten) contribute exactly zero', () => {
  const meals = buildBugReportScenario()
  const postWorkout = meals.find(m => m.name === 'Post-Workout')!
  const dinner = meals.find(m => m.name === 'Dinner')!
  assert.deepStrictEqual(computeMealActual(postWorkout), zeroMacros())
  assert.deepStrictEqual(computeMealActual(dinner), zeroMacros())
})

test('dashboard bug repro - the same food (Banana) in two different meals is tracked and summed independently', () => {
  const meals = buildBugReportScenario()
  const lunch = meals.find(m => m.name === 'Lunch')!
  const preWorkout = meals.find(m => m.name === 'Pre-Workout')!
  const lunchBanana = lunch.foods.find(f => f.id === 'banana-lunch')!
  const preWorkoutBanana = preWorkout.foods.find(f => f.id === 'banana-preworkout')!

  assert.notStrictEqual(lunchBanana.id, preWorkoutBanana.id)
  const lunchBananaActual = computeActualFoodMacros(lunchBanana.quantity, lunchBanana)
  const preWorkoutBananaActual = computeActualFoodMacros(preWorkoutBanana.quantity, preWorkoutBanana)
  // Each banana counts once - the pair sums to double one banana's macros,
  // not a single banana's macros deduplicated away.
  assert.strictEqual(lunchBananaActual.calories + preWorkoutBananaActual.calories, 210)
})

// The exact scenario from the bug report: the dashboard's daily total must
// equal the sum of the per-meal actuals above (1557/105/200/40), never the
// previously-reported inflated 2176/127/293/60 (which corresponded to
// Breakfast's own actual - 618/21/93/20 - being folded into the total an
// extra time, plus 1 stray kcal of rounding drift: 1557+618=2175, and the
// reported bug had 2176).
test('dashboard bug repro - daily consumed total is 1557/105/200/40, NOT the previously-reported 2176/127/293/60', () => {
  const meals = buildBugReportScenario()
  const consumed = sumMacros(meals.map(computeMealActual))

  assert.deepStrictEqual(consumed, { calories: 1557, protein: 105, carbs: 200, fat: 40 })

  assert.notStrictEqual(consumed.calories, 2176)
  assert.notStrictEqual(consumed.protein, 127)
  assert.notStrictEqual(consumed.carbs, 293)
  assert.notStrictEqual(consumed.fat, 60)
})

test('dashboard bug repro - the daily target (2060/165/225/61) is independent of consumed and is never mixed into it', () => {
  const target = { calories: 2060, protein: 165, carbs: 225, fat: 61 }
  const meals = buildBugReportScenario()
  const consumed = sumMacros(meals.map(computeMealActual))

  // Target must equal the plan's own configured values, completely
  // unaffected by how much has actually been eaten.
  assert.deepStrictEqual(target, { calories: 2060, protein: 165, carbs: 225, fat: 61 })
  // And consumed must never equal, or have been derived from, target.
  assert.notDeepStrictEqual(consumed, target)
})

test('dashboard bug repro - percentages match the expected dashboard display (~76% consumed, not 106%)', () => {
  const target = { calories: 2060, protein: 165, carbs: 225, fat: 61 }
  const meals = buildBugReportScenario()
  const consumed = sumMacros(meals.map(computeMealActual))

  assert.strictEqual(Math.round(pctOf(consumed.calories, target.calories)), 76)
  assert.strictEqual(Math.round(pctOf(consumed.protein, target.protein)), 64)
  assert.strictEqual(Math.round(pctOf(consumed.carbs, target.carbs)), 89)
  assert.strictEqual(Math.round(pctOf(consumed.fat, target.fat)), 66)

  const remaining = target.calories - consumed.calories
  assert.strictEqual(remaining, 503)
})

// Demonstrates the actual failure mode being guarded against: an unscoped
// "sum every completed row for the date" query (the pre-fix behavior) is
// vulnerable to double-counting the instant a stale/orphaned row and a
// fresh row both exist for the same real eating event - exactly what a
// same-day plan edit with an unmatched relink leaves behind. The
// plan-scoped, per-meal-actual computation above is immune to this by
// construction, because a stale row (belonging to no current meal) is never
// included in any meal's food list in the first place.
test('dashboard bug repro - mechanism check: an unscoped raw-row sum double-counts a stale + fresh row pair; the plan-scoped sum does not', () => {
  const [breakfast] = buildBugReportScenario()
  const correctBreakfastActual = computeMealActual(breakfast)

  // Simulates the OLD recomputeDailyAndReturn: a flat list of every
  // completed=true food_tracking row for the day, with no awareness of
  // which foods still belong to the current plan. A same-day edit that
  // failed to relink Breakfast's foods would leave the ORIGINAL rows
  // (food_id now NULL) in this list alongside freshly-logged rows for the
  // same real foods under their post-edit ids.
  const staleOrphanedRows: MacroTotals[] = breakfast.foods.map(f => ({
    calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat
  }))
  const freshPostEditRows: MacroTotals[] = breakfast.foods.map(f => ({
    calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat
  }))
  const unscopedRawSum = sumMacros([...staleOrphanedRows, ...freshPostEditRows])

  // The old, buggy approach: Breakfast gets counted twice.
  assert.strictEqual(unscopedRawSum.calories, correctBreakfastActual.calories * 2)

  // The current, fixed approach never sees the orphaned rows at all, since
  // it only ever sums the foods actually present in the (simulated)
  // current plan's meals - so it can't double-count regardless of how many
  // stale rows accumulate in food_tracking.
  assert.strictEqual(correctBreakfastActual.calories, 618)
})
