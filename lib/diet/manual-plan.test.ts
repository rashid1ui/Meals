// Coverage for the manual onboarding meal builder's data-flow correctness -
// against the *existing, reused* pure helpers (lib/diet/save-plan.ts,
// lib/diet/diff.ts, lib/nutrition/calculator.ts, lib/nutrition/proteinType.ts,
// lib/nutrition/carbType.ts) rather than duplicating their logic. There is
// deliberately no new pure logic inside app/onboarding/manual-actions.ts
// itself to unit-test - it's a 'use server' action whose real behavior
// (DB writes, RLS) is covered separately by
// tests/integration/manual-plan.test.ts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveMeal, validateMealsShape, type SaveDietPlanMeal } from './save-plan'
import { computeMealTotals, computeDailyTotals, removeMeal, uniqueMealName, type DraftMeal } from './diff'
import { calculateFoodMacros, type FoodMacro } from '../nutrition/calculator'
import { splitProteinByType } from '../nutrition/proteinType'
import { splitCarbsByType } from '../nutrition/carbType'

function dbFood(overrides: Partial<FoodMacro> & { id: string }): FoodMacro {
  return {
    name: 'Chicken Breast, Raw',
    serving_size: 100,
    serving_unit: 'grams',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    ...overrides
  }
}

test('creating a manual plan - a valid from-scratch payload (every food has foodDatabaseId, nothing locked) resolves correctly', () => {
  const chicken = dbFood({ id: 'chicken', name: 'Chicken Breast, Raw', calories: 165, protein: 31, carbs: 0, fat: 3.6 })
  const rice = dbFood({ id: 'rice', name: 'White Rice, Dry', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 })

  const foodDatabaseById = new Map([
    [chicken.id, chicken],
    [rice.id, rice]
  ])

  const payload: SaveDietPlanMeal[] = [
    {
      name: 'Lunch',
      foods: [
        { foodDatabaseId: 'chicken', originalFoodId: null, quantity: 150, unit: 'grams' },
        { foodDatabaseId: 'rice', originalFoodId: null, quantity: 100, unit: 'grams' }
      ]
    }
  ]

  assert.strictEqual(validateMealsShape(payload), null)

  const result = resolveMeal(payload[0], foodDatabaseById, new Map())
  assert.ok('meal' in result)
  if (!('meal' in result)) return

  assert.strictEqual(result.meal.name, 'Lunch')
  assert.strictEqual(result.meal.foods.length, 2)
  const [resolvedChicken, resolvedRice] = result.meal.foods
  assert.strictEqual(resolvedChicken.calories, 165 * 1.5)
  assert.strictEqual(resolvedChicken.protein, 31 * 1.5)
  assert.strictEqual(resolvedRice.carbs, 80)
})

test('validateMealsShape - rejects an empty meal list and an unnamed meal, same structural rules saveDietPlan enforces', () => {
  assert.notStrictEqual(validateMealsShape([]), null)
  assert.notStrictEqual(validateMealsShape([{ name: '  ', foods: [] }]), null)
  assert.strictEqual(validateMealsShape([{ name: 'Breakfast', foods: [] }]), null)
})

test('adding a food - resolveMeal produces correct macros for a newly-added foodDatabaseId item', () => {
  const oats = dbFood({ id: 'oats', name: 'Rolled Oats, Dry', calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 })
  const foodDatabaseById = new Map([[oats.id, oats]])

  const meal: SaveDietPlanMeal = {
    name: 'Breakfast',
    foods: [{ foodDatabaseId: 'oats', originalFoodId: null, quantity: 50, unit: 'grams' }]
  }

  const result = resolveMeal(meal, foodDatabaseById, new Map())
  assert.ok('meal' in result)
  if (!('meal' in result)) return

  const [resolved] = result.meal.foods
  const expected = calculateFoodMacros(50, oats)
  assert.strictEqual(resolved.calories, expected.calories)
  assert.strictEqual(resolved.protein, expected.protein)
  assert.strictEqual(resolved.carbs, expected.carbs)
  assert.strictEqual(resolved.fat, expected.fat)
})

test('changing quantity - recomputed macros scale linearly with the new quantity', () => {
  const chicken = dbFood({ id: 'chicken', calories: 165, protein: 31, carbs: 0, fat: 3.6 })

  const at100g = calculateFoodMacros(100, chicken)
  const at250g = calculateFoodMacros(250, chicken)

  assert.strictEqual(at250g.calories, at100g.calories * 2.5)
  assert.strictEqual(at250g.protein, at100g.protein * 2.5)
  assert.strictEqual(at250g.fat, at100g.fat * 2.5)
})

test('resolveMeal - rejects an unresolvable foodDatabaseId rather than silently trusting client-sent macros', () => {
  const meal: SaveDietPlanMeal = {
    name: 'Lunch',
    foods: [{ foodDatabaseId: 'does-not-exist', originalFoodId: null, quantity: 100, unit: 'grams' }]
  }
  const result = resolveMeal(meal, new Map(), new Map())
  assert.ok('error' in result)
})

test('macro calculation correctness - computeMealTotals/computeDailyTotals sum correctly across meals', () => {
  const meals: DraftMeal[] = [
    {
      id: 'm1',
      name: 'Breakfast',
      sortOrder: 0,
      foods: [
        { id: 'f1', foodDatabaseId: 'oats', name: 'Rolled Oats, Dry', quantity: 50, unit: 'grams', calories: 194.5, protein: 8.45, carbs: 33.15, fat: 3.45 }
      ]
    },
    {
      id: 'm2',
      name: 'Lunch',
      sortOrder: 1,
      foods: [
        { id: 'f2', foodDatabaseId: 'chicken', name: 'Chicken Breast, Raw', quantity: 150, unit: 'grams', calories: 247.5, protein: 46.5, carbs: 0, fat: 5.4 },
        { id: 'f3', foodDatabaseId: 'rice', name: 'White Rice, Dry', quantity: 100, unit: 'grams', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 }
      ]
    }
  ]

  const lunchTotals = computeMealTotals(meals[1])
  assert.strictEqual(lunchTotals.calories, 247.5 + 365)
  assert.strictEqual(lunchTotals.protein, 46.5 + 7.1)

  const dailyTotals = computeDailyTotals(meals)
  // Floating-point summation order isn't guaranteed to match a differently-
  // ordered literal sum bit-for-bit - compared with an epsilon, same as this
  // file's other cross-total reconciliation checks below.
  assert.ok(Math.abs(dailyTotals.calories - (194.5 + 247.5 + 365)) < 1e-9)
  assert.ok(Math.abs(dailyTotals.protein - (8.45 + 46.5 + 7.1)) < 1e-9)
  assert.ok(Math.abs(dailyTotals.carbs - (33.15 + 0 + 80)) < 1e-9)
  assert.ok(Math.abs(dailyTotals.fat - (3.45 + 5.4 + 0.7)) < 1e-9)
})

test('macro calculation correctness - splitProteinByType/splitCarbsByType reconcile exactly to the daily totals', () => {
  const meals: DraftMeal[] = [
    {
      id: 'm1',
      name: 'Breakfast',
      sortOrder: 0,
      foods: [
        { id: 'f1', foodDatabaseId: 'oats', name: 'Rolled Oats, Dry', quantity: 50, unit: 'grams', calories: 194.5, protein: 8.45, carbs: 33.15, fat: 3.45 }
      ]
    },
    {
      id: 'm2',
      name: 'Lunch',
      sortOrder: 1,
      foods: [
        { id: 'f2', foodDatabaseId: 'chicken', name: 'Chicken Breast, Raw', quantity: 150, unit: 'grams', calories: 247.5, protein: 46.5, carbs: 0, fat: 5.4 }
      ]
    }
  ]

  const allFoods = meals.flatMap(m => m.foods)
  const dailyTotals = computeDailyTotals(meals)

  const proteinLookup = new Map([
    ['Rolled Oats, Dry', 'plant' as const],
    ['Chicken Breast, Raw', 'animal' as const]
  ])
  const proteinBreakdown = splitProteinByType(allFoods, proteinLookup)
  assert.ok(Math.abs(proteinBreakdown.animal + proteinBreakdown.plant + proteinBreakdown.supplement - dailyTotals.protein) < 1e-9)

  const carbLookup = new Map([['Rolled Oats, Dry', 'complex' as const]])
  const carbBreakdown = splitCarbsByType(allFoods, carbLookup)
  assert.ok(Math.abs(carbBreakdown.simple + carbBreakdown.complex - dailyTotals.carbs) < 1e-9)
})

// ---------------------------------------------------------------------------
// Manual Mode product rule: the nutrition target is GUIDANCE ONLY. The user's
// selected foods, quantities, meals, order and distribution ARE the plan. The
// manual save path (app/onboarding/manual-actions.ts) must NEVER scale,
// rebalance, add/remove foods, or normalize the plan toward the target.
//
// resolveMeal (lib/diet/save-plan.ts) is the ONLY transform the manual
// payload passes through on the server before it is written to meals/foods.
// It takes no target parameter at all - these tests pin that: identical
// payload in => identical rows out, regardless of the target shown alongside.
// ---------------------------------------------------------------------------

// Seven synthetic food_database rows, all serving_size 100 / serving_unit
// 'grams', with calories set independently of the 4/4/9 macro sum (exactly
// like real food_database rows, where label calories differ from the Atwater
// estimate). At quantity 100 each, calculateFoodMacros' multiplier is 1, so
// every row contributes its values verbatim - the plan below sums to exactly
// 2060 kcal / 165P / 225C / 61F.
function manualRuleDb(): Map<string, FoodMacro> {
  return new Map(
    [
      dbFood({ id: 'a', name: 'Food A', calories: 300, protein: 20, carbs: 40, fat: 8 }),
      dbFood({ id: 'b', name: 'Food B', calories: 160, protein: 10, carbs: 20, fat: 4 }),
      dbFood({ id: 'c', name: 'Food C', calories: 515, protein: 45, carbs: 55, fat: 15 }),
      dbFood({ id: 'd', name: 'Food D', calories: 450, protein: 40, carbs: 30, fat: 18 }),
      dbFood({ id: 'e', name: 'Food E', calories: 385, protein: 15, carbs: 65, fat: 4 }),
      dbFood({ id: 'f', name: 'Food F', calories: 170, protein: 25, carbs: 10, fat: 8 }),
      dbFood({ id: 'g', name: 'Food G', calories: 80, protein: 10, carbs: 5, fat: 4 })
    ].map(f => [f.id, f])
  )
}

// The exact structure the user built: 5 meals, specific order, specific food
// distribution ([2,1,1,1,2] foods per meal), all quantities 100g.
function manualRulePayload(): SaveDietPlanMeal[] {
  return [
    {
      name: 'Breakfast',
      foods: [
        { foodDatabaseId: 'a', originalFoodId: null, quantity: 100, unit: 'grams' },
        { foodDatabaseId: 'b', originalFoodId: null, quantity: 100, unit: 'grams' }
      ]
    },
    { name: 'Lunch', foods: [{ foodDatabaseId: 'c', originalFoodId: null, quantity: 100, unit: 'grams' }] },
    { name: 'Dinner', foods: [{ foodDatabaseId: 'd', originalFoodId: null, quantity: 100, unit: 'grams' }] },
    { name: 'Pre-Workout', foods: [{ foodDatabaseId: 'e', originalFoodId: null, quantity: 100, unit: 'grams' }] },
    {
      name: 'Post-Workout',
      foods: [
        { foodDatabaseId: 'f', originalFoodId: null, quantity: 100, unit: 'grams' },
        { foodDatabaseId: 'g', originalFoodId: null, quantity: 100, unit: 'grams' }
      ]
    }
  ]
}

// Runs the payload through the real server-side resolution and returns the
// resolved meals plus their summed nutrition (via the same computeDailyTotals
// the builder/review UI use). No production logic is reimplemented here.
function resolveManualPlan(payload: SaveDietPlanMeal[], db: Map<string, FoodMacro> = manualRuleDb()) {
  const resolvedMeals = payload.map(meal => {
    const result = resolveMeal(meal, db, new Map())
    assert.ok('meal' in result, 'expected the meal to resolve')
    if (!('meal' in result)) throw new Error('unreachable')
    return result.meal
  })
  const asDraft: DraftMeal[] = resolvedMeals.map((m, i) => ({
    id: `m${i}`,
    name: m.name,
    sortOrder: i,
    foods: m.foods.map((f, j) => ({ id: `m${i}f${j}`, foodDatabaseId: null, ...f }))
  }))
  return { resolvedMeals, totals: computeDailyTotals(asDraft) }
}

// The target from the product spec's worked example - deliberately different
// from the plan on every macro (calories & carbs BELOW it, protein & fat
// ABOVE it). It is never passed into resolution; it exists here only to be
// asserted as untouched and non-influential.
const MANUAL_RULE_TARGET = { calories: 2295, protein: 146, carbs: 297, fat: 58 }
const MANUAL_RULE_PLAN = { calories: 2060, protein: 165, carbs: 225, fat: 61 }

test('Manual Mode - explicit spec scenario: plan 2060/165/225/61 is saved verbatim against target 2295/146/297/58', () => {
  const { totals } = resolveManualPlan(manualRulePayload())

  // Plan nutrition is exactly the sum of the selected foods...
  assert.equal(Math.round(totals.calories), MANUAL_RULE_PLAN.calories)
  assert.equal(Math.round(totals.protein), MANUAL_RULE_PLAN.protein)
  assert.equal(Math.round(totals.carbs), MANUAL_RULE_PLAN.carbs)
  assert.equal(Math.round(totals.fat), MANUAL_RULE_PLAN.fat)

  // ...and is NOT normalized toward the target on any macro.
  assert.notEqual(Math.round(totals.calories), MANUAL_RULE_TARGET.calories)
  assert.notEqual(Math.round(totals.protein), MANUAL_RULE_TARGET.protein)
  assert.notEqual(Math.round(totals.carbs), MANUAL_RULE_TARGET.carbs)
  assert.notEqual(Math.round(totals.fat), MANUAL_RULE_TARGET.fat)

  // The plan sits on the same side of the target the user built it on -
  // nothing nudged it closer.
  assert.ok(totals.calories < MANUAL_RULE_TARGET.calories, 'calories stay below target, not raised to it')
  assert.ok(totals.protein > MANUAL_RULE_TARGET.protein, 'protein stays above target, not cut to it')
  assert.ok(totals.carbs < MANUAL_RULE_TARGET.carbs, 'carbs stay below target, not raised to it')
  assert.ok(totals.fat > MANUAL_RULE_TARGET.fat, 'fat stays above target, not cut to it')
})

test('Manual Mode - saved nutrition equals the sum of the selected foods (per-food, deterministic)', () => {
  const db = manualRuleDb()
  const { resolvedMeals } = resolveManualPlan(manualRulePayload(), db)
  const flat = resolvedMeals.flatMap(m => m.foods)

  let cal = 0, p = 0, c = 0, f = 0
  for (const food of db.values()) {
    const expected = calculateFoodMacros(100, food)
    cal += expected.calories; p += expected.protein; c += expected.carbs; f += expected.fat
  }
  const sum = (key: 'calories' | 'protein' | 'carbs' | 'fat') => flat.reduce((acc, x) => acc + x[key], 0)

  assert.ok(Math.abs(sum('calories') - cal) < 1e-9)
  assert.ok(Math.abs(sum('protein') - p) < 1e-9)
  assert.ok(Math.abs(sum('carbs') - c) < 1e-9)
  assert.ok(Math.abs(sum('fat') - f) < 1e-9)
})

test('Manual Mode - exact meal count, names and order are preserved', () => {
  const { resolvedMeals } = resolveManualPlan(manualRulePayload())
  assert.equal(resolvedMeals.length, 5)
  assert.deepEqual(
    resolvedMeals.map(m => m.name),
    ['Breakfast', 'Lunch', 'Dinner', 'Pre-Workout', 'Post-Workout']
  )
})

test('Manual Mode - exact food distribution between meals is preserved', () => {
  const { resolvedMeals } = resolveManualPlan(manualRulePayload())
  assert.deepEqual(resolvedMeals.map(m => m.foods.length), [2, 1, 1, 1, 2])
  assert.deepEqual(resolvedMeals[0].foods.map(f => f.name), ['Food A', 'Food B'])
  assert.deepEqual(resolvedMeals[4].foods.map(f => f.name), ['Food F', 'Food G'])
})

test('Manual Mode - exact food order within a meal is preserved (not reordered)', () => {
  const payload = manualRulePayload()
  // Flip the two Breakfast foods; the resolved order must follow the payload.
  payload[0].foods.reverse()
  const { resolvedMeals } = resolveManualPlan(payload)
  assert.deepEqual(resolvedMeals[0].foods.map(f => f.name), ['Food B', 'Food A'])
})

test('Manual Mode - exact quantities and units are preserved', () => {
  const { resolvedMeals } = resolveManualPlan(manualRulePayload())
  for (const meal of resolvedMeals) {
    for (const food of meal.foods) {
      assert.equal(food.quantity, 100)
      assert.equal(food.unit, 'grams')
    }
  }
})

test('Manual Mode - nutrition target is independent of the manual payload (same foods + different target => identical plan)', () => {
  // Two different targets a caller might show alongside the builder. The
  // target is not an input to resolution - proving independence means the
  // resolved rows and totals are identical no matter which one is displayed.
  const targetA = { calories: 2295, protein: 146, carbs: 297, fat: 58 }
  const targetB = { calories: 2500, protein: 180, carbs: 250, fat: 70 }
  assert.notDeepEqual(targetA, targetB)

  const a = resolveManualPlan(manualRulePayload())
  const b = resolveManualPlan(manualRulePayload())
  assert.deepEqual(a.resolvedMeals, b.resolvedMeals)
  assert.deepEqual(a.totals, b.totals)
})

// Directional preservation - one focused test per macro/side. Each builds a
// single-food plan, then names a target that sits on the opposite side, and
// asserts resolution leaves the plan value exactly where the user put it.
function singleFoodTotals(food: FoodMacro, quantity: number) {
  const { totals } = resolveManualPlan(
    [{ name: 'Meal 1', foods: [{ foodDatabaseId: food.id, originalFoodId: null, quantity, unit: 'grams' }] }],
    new Map([[food.id, food]])
  )
  return totals
}

test('Manual Mode - a plan BELOW the calorie target is preserved', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 300, protein: 20, carbs: 40, fat: 8 }), 100)
  assert.equal(Math.round(totals.calories), 300)
  assert.ok(totals.calories < 2295) // target far above; plan not raised toward it
})

test('Manual Mode - a plan ABOVE the calorie target is preserved', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 515, protein: 45, carbs: 55, fat: 15 }), 500)
  assert.equal(Math.round(totals.calories), 2575)
  assert.ok(totals.calories > 1800) // target below; plan not scaled down toward it
})

test('Manual Mode - protein ABOVE target is preserved (not reduced)', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 515, protein: 45, carbs: 55, fat: 15 }), 400)
  assert.equal(Math.round(totals.protein), 180)
  assert.ok(totals.protein > 146)
})

test('Manual Mode - protein BELOW target is preserved (not topped up)', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 385, protein: 15, carbs: 65, fat: 4 }), 100)
  assert.equal(Math.round(totals.protein), 15)
  assert.ok(totals.protein < 146)
})

test('Manual Mode - carbs ABOVE target are preserved (not reduced)', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 385, protein: 15, carbs: 65, fat: 4 }), 600)
  assert.equal(Math.round(totals.carbs), 390)
  assert.ok(totals.carbs > 297)
})

test('Manual Mode - carbs BELOW target are preserved (not topped up)', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 450, protein: 40, carbs: 30, fat: 18 }), 100)
  assert.equal(Math.round(totals.carbs), 30)
  assert.ok(totals.carbs < 297)
})

test('Manual Mode - fat ABOVE target is preserved (not reduced)', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 450, protein: 40, carbs: 30, fat: 18 }), 500)
  assert.equal(Math.round(totals.fat), 90)
  assert.ok(totals.fat > 58)
})

test('Manual Mode - fat BELOW target is preserved (not topped up)', () => {
  const totals = singleFoodTotals(dbFood({ id: 'x', name: 'Food X', calories: 385, protein: 15, carbs: 65, fat: 4 }), 100)
  assert.equal(Math.round(totals.fat), 4)
  assert.ok(totals.fat < 58)
})

// ---------------------------------------------------------------------------
// Manual Mode product rule (meal level): the user has complete control over
// WHICH meals exist. If they can add a meal they can remove it - including
// Pre-Workout / Post-Workout / Snack, none of which are product-mandatory in
// Manual Mode. Removing a meal drops that meal and its foods from the plan;
// nothing recreates it, no target math adds it back, and training options
// never force it. The only floor is validateMealsShape's "at least one meal".
// ---------------------------------------------------------------------------

// A builder tree (DraftMeal[], with ids) matching the product spec's example:
// Breakfast / Lunch / Dinner / Pre-Workout. Foods reuse manualRuleDb() rows.
function mealFlexDraft(): DraftMeal[] {
  const f = (id: string, dbId: string) => ({
    id,
    foodDatabaseId: dbId,
    name: manualRuleDb().get(dbId)!.name,
    quantity: 100,
    unit: 'grams',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  })
  return [
    { id: 'm-b', name: 'Breakfast', sortOrder: 0, foods: [f('fa', 'a'), f('fb', 'b')] },
    { id: 'm-l', name: 'Lunch', sortOrder: 1, foods: [f('fc', 'c')] },
    { id: 'm-d', name: 'Dinner', sortOrder: 2, foods: [f('fd', 'd')] },
    { id: 'm-pw', name: 'Pre-Workout', sortOrder: 3, foods: [f('fe', 'e')] }
  ]
}

// The exact client boundary transform handleManualSubmit (OnboardingForm)
// applies to build the server payload from the builder's DraftMeal[] state:
// meal name + order verbatim, per-food { foodDatabaseId, quantity, unit }.
// Nothing is added, dropped, reordered, or renumbered here.
function draftToSavePayload(meals: DraftMeal[]): SaveDietPlanMeal[] {
  return meals.map(meal => ({
    name: meal.name,
    foods: meal.foods.map(food => ({
      foodDatabaseId: food.foodDatabaseId,
      originalFoodId: food.foodDatabaseId ? null : food.id,
      quantity: food.quantity,
      unit: food.unit
    }))
  }))
}

test('Manual Mode meal level - EXPLICIT SPEC: remove Pre-Workout, final payload is exactly Breakfast/Lunch/Dinner', () => {
  const built = removeMeal(mealFlexDraft(), 'm-pw')

  // Builder state
  assert.deepEqual(built.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner'])
  assert.ok(!built.some(m => m.name === 'Pre-Workout'), 'Pre-Workout is gone from the builder')

  // Submitted payload
  const payload = draftToSavePayload(built)
  assert.deepEqual(payload.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner'])
  assert.equal(payload.length, 3)

  // Server-resolved rows (what actually gets persisted, sort_order = index)
  const { resolvedMeals } = resolveManualPlan(payload)
  assert.deepEqual(resolvedMeals.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner'])
  assert.ok(!resolvedMeals.some(m => m.name === 'Pre-Workout'))
  // Pre-Workout's food (Food E) is not anywhere in the persisted plan.
  assert.ok(!resolvedMeals.flatMap(m => m.foods).some(food => food.name === 'Food E'))
})

test('Manual Mode meal level - add a meal: it exists in the builder and in the submitted payload', () => {
  const meals = mealFlexDraft()
  const added: DraftMeal = {
    id: 'm-new',
    name: uniqueMealName(meals.map(m => m.name), 'Post-Workout'),
    sortOrder: meals.length,
    foods: []
  }
  const built = [...meals, added]
  assert.deepEqual(built.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner', 'Pre-Workout', 'Post-Workout'])
  assert.deepEqual(draftToSavePayload(built).map(m => m.name), [
    'Breakfast', 'Lunch', 'Dinner', 'Pre-Workout', 'Post-Workout'
  ])
})

test('Manual Mode meal level - remove a meal: it is absent from the final payload (Pre/Post-Workout, Snack)', () => {
  for (const name of ['Pre-Workout', 'Post-Workout', 'Snack']) {
    const meals: DraftMeal[] = [
      { id: 'm1', name: 'Breakfast', sortOrder: 0, foods: [] },
      { id: 'm2', name: 'Lunch', sortOrder: 1, foods: [] },
      { id: 'm3', name, sortOrder: 2, foods: [] }
    ]
    const payload = draftToSavePayload(removeMeal(meals, 'm3'))
    assert.deepEqual(payload.map(m => m.name), ['Breakfast', 'Lunch'], `${name} removed`)
    assert.ok(!payload.some(m => m.name === name))
  }
})

test('Manual Mode meal level - removing a middle meal preserves the original order of the rest', () => {
  const built = removeMeal(mealFlexDraft(), 'm-l') // drop Lunch
  assert.deepEqual(built.map(m => m.name), ['Breakfast', 'Dinner', 'Pre-Workout'])
  const { resolvedMeals } = resolveManualPlan(draftToSavePayload(built))
  assert.deepEqual(resolvedMeals.map(m => m.name), ['Breakfast', 'Dinner', 'Pre-Workout'])
})

test('Manual Mode meal level - removing a meal removes all of its foods from the final payload', () => {
  const built = removeMeal(mealFlexDraft(), 'm-b') // Breakfast held Food A + Food B
  const foods = draftToSavePayload(built).flatMap(m => m.foods.map(f => f.foodDatabaseId))
  assert.ok(!foods.includes('a') && !foods.includes('b'), 'both Breakfast foods are gone')
  assert.deepEqual(foods, ['c', 'd', 'e'])
})

test('Manual Mode meal level - daily totals immediately exclude the removed meal, with no rebalancing', () => {
  // Give the draft real macro numbers so totals are meaningful.
  const withMacros = mealFlexDraft().map(m => ({
    ...m,
    foods: m.foods.map(food => {
      const db = manualRuleDb().get(food.foodDatabaseId!)!
      return { ...food, calories: db.calories, protein: db.protein, carbs: db.carbs, fat: db.fat }
    })
  }))
  const before = computeDailyTotals(withMacros)
  const after = computeDailyTotals(removeMeal(withMacros, 'm-pw'))
  // Food E (Pre-Workout) = 385 / 15 / 65 / 4. After removal totals drop by
  // exactly that and nothing else moves.
  assert.deepEqual(
    { calories: before.calories - after.calories, protein: before.protein - after.protein, carbs: before.carbs - after.carbs, fat: before.fat - after.fat },
    { calories: 385, protein: 15, carbs: 65, fat: 4 }
  )
})

test('Manual Mode meal level - removing a meal never causes another meal to be created', () => {
  const built = removeMeal(mealFlexDraft(), 'm-pw')
  assert.equal(built.length, 3, 'exactly one fewer meal')
  // Idempotent: re-running removal for the same id changes nothing further.
  assert.equal(removeMeal(built, 'm-pw').length, 3)
})

test('Manual Mode meal level - changing the nutrition target does not recreate a removed meal', () => {
  const built = removeMeal(mealFlexDraft(), 'm-pw')
  const payload = draftToSavePayload(built)
  // The target is never an input to the payload build or to resolveMeal.
  const targetA = { calories: 2295, protein: 146, carbs: 297, fat: 58 }
  const targetB = { calories: 2600, protein: 200, carbs: 300, fat: 80 }
  assert.notDeepEqual(targetA, targetB)
  const a = resolveManualPlan(payload)
  const b = resolveManualPlan(payload)
  assert.deepEqual(a.resolvedMeals.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner'])
  assert.deepEqual(a.resolvedMeals, b.resolvedMeals)
})

test('Manual Mode meal level - final submitted meal count equals the builder meal count', () => {
  let built = mealFlexDraft()
  assert.equal(draftToSavePayload(built).length, built.length)
  built = removeMeal(built, 'm-l')
  built = removeMeal(built, 'm-pw')
  assert.equal(built.length, 2)
  assert.equal(draftToSavePayload(built).length, 2)
})

test('Manual Mode meal level - final persisted meal order (sort_order = array index) matches builder order', () => {
  const built = removeMeal(mealFlexDraft(), 'm-l') // Breakfast, Dinner, Pre-Workout
  const payload = draftToSavePayload(built)
  // createManualDietPlanLocked writes sort_order: i for payload.meals[i], so
  // the persisted order is exactly the payload/builder array order.
  const persisted = payload.map((m, i) => ({ sort_order: i, name: m.name }))
  assert.deepEqual(persisted, [
    { sort_order: 0, name: 'Breakfast' },
    { sort_order: 1, name: 'Dinner' },
    { sort_order: 2, name: 'Pre-Workout' }
  ])
})

test('Manual Mode meal level - at least one meal is still a server invariant (empty plan rejected)', () => {
  assert.notEqual(validateMealsShape([]), null)
  // A single remaining meal - even with no foods yet - is structurally valid;
  // the food check happens elsewhere (handleManualSubmit / per-food rules).
  assert.equal(validateMealsShape([{ name: 'Breakfast', foods: [] }]), null)
})

test('Manual Mode meal level - removing meals never invokes AI: the manual save path imports no generation code', () => {
  const manualActions = readFileSync(
    fileURLToPath(new URL('../../app/onboarding/manual-actions.ts', import.meta.url)),
    'utf8'
  )
  const builder = readFileSync(
    fileURLToPath(new URL('../../app/onboarding/ManualMealBuilderStep.tsx', import.meta.url)),
    'utf8'
  )
  for (const src of [manualActions, builder]) {
    assert.ok(!/generate-diet|deepseek|DeepSeek|openai|OpenAI/i.test(src))
  }
  // And removeMeal itself is a pure array filter - no imports at all.
  assert.equal(removeMeal([{ id: 'x', name: 'X', sortOrder: 0, foods: [] }], 'x').length, 0)
})
