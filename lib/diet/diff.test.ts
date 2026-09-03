import test from 'node:test'
import assert from 'node:assert'
import {
  diffMeals,
  computeMealTotals,
  computeDailyTotals,
  classifyTarget,
  getFoodBadges,
  moveFood,
  moveMeal,
  removeMeal,
  uniqueMealName,
  defaultMealNamesForCount,
  type DraftMeal
} from './diff'

function meal(id: string, name: string, foods: DraftMeal['foods']): DraftMeal {
  return { id, name, sortOrder: 0, foods }
}

function food(id: string, name: string, quantity: number, calories: number, protein: number, carbs: number, fat: number) {
  return { id, foodDatabaseId: 'db-' + id, name, quantity, unit: 'grams', calories, protein, carbs, fat }
}

test('diffMeals - no changes when draft equals original', () => {
  const original = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)])]
  const draft = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)])]
  assert.deepStrictEqual(diffMeals(original, draft), [])
})

test('diffMeals - change food quantity is detected as increased/decreased', () => {
  const original = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)])]

  const increased = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 150, 214.5, 18.9, 1.05, 14.25)])]
  const increaseChanges = diffMeals(original, increased)
  assert.strictEqual(increaseChanges.length, 1)
  assert.strictEqual(increaseChanges[0].type, 'increased')
  if (increaseChanges[0].type === 'increased') {
    assert.strictEqual(increaseChanges[0].fromQuantity, 100)
    assert.strictEqual(increaseChanges[0].toQuantity, 150)
  }

  const decreased = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 50, 71.5, 6.3, 0.35, 4.75)])]
  const decreaseChanges = diffMeals(original, decreased)
  assert.strictEqual(decreaseChanges.length, 1)
  assert.strictEqual(decreaseChanges[0].type, 'decreased')
})

test('diffMeals - add food is detected', () => {
  const original = [meal('m1', 'Breakfast', [])]
  const draft = [meal('m1', 'Breakfast', [food('new-1', 'Banana', 100, 89, 1.1, 22.8, 0.3)])]
  const changes = diffMeals(original, draft)
  assert.strictEqual(changes.length, 1)
  assert.strictEqual(changes[0].type, 'added')
  if (changes[0].type === 'added') {
    assert.strictEqual(changes[0].foodName, 'Banana')
    assert.strictEqual(changes[0].mealName, 'Breakfast')
  }
})

test('diffMeals - remove food is detected', () => {
  const original = [meal('m1', 'Breakfast', [food('f1', 'Apple', 200, 104, 0.6, 27.6, 0.4)])]
  const draft = [meal('m1', 'Breakfast', [])]
  const changes = diffMeals(original, draft)
  assert.strictEqual(changes.length, 1)
  assert.strictEqual(changes[0].type, 'removed')
  if (changes[0].type === 'removed') {
    assert.strictEqual(changes[0].foodName, 'Apple')
    assert.strictEqual(changes[0].quantity, 200)
  }
})

test('diffMeals - add meal is detected, including Pre-Workout/Post-Workout types', () => {
  const original: DraftMeal[] = []

  const withPreWorkout = diffMeals(original, [meal('new-m1', 'Pre-Workout', [])])
  assert.strictEqual(withPreWorkout.length, 1)
  assert.strictEqual(withPreWorkout[0].type, 'meal-added')
  if (withPreWorkout[0].type === 'meal-added') {
    assert.strictEqual(withPreWorkout[0].mealName, 'Pre-Workout')
  }

  const withPostWorkout = diffMeals(original, [meal('new-m2', 'Post-Workout', [])])
  assert.strictEqual(withPostWorkout[0].type, 'meal-added')
  if (withPostWorkout[0].type === 'meal-added') {
    assert.strictEqual(withPostWorkout[0].mealName, 'Post-Workout')
  }
})

test('diffMeals - move food between meals preserves quantity and is detected as moved', () => {
  const chickenAt = (quantity: number) => food('f1', 'Chicken Breast', quantity, 120 * quantity / 100, 22.5 * quantity / 100, 0, 2.6 * quantity / 100)
  const original = [
    meal('dinner', 'Dinner', [chickenAt(150)]),
    meal('post', 'Post-Workout', [])
  ]
  const draft = [
    meal('dinner', 'Dinner', []),
    meal('post', 'Post-Workout', [chickenAt(150)])
  ]

  const changes = diffMeals(original, draft)
  assert.strictEqual(changes.length, 1)
  assert.strictEqual(changes[0].type, 'moved')
  if (changes[0].type === 'moved') {
    assert.strictEqual(changes[0].foodName, 'Chicken Breast')
    assert.strictEqual(changes[0].quantity, 150) // quantity preserved across the move
    assert.strictEqual(changes[0].fromMealName, 'Dinner')
    assert.strictEqual(changes[0].toMealName, 'Post-Workout')
  }
})

test('diffMeals - moved AND resized food produces both a moved and a quantity change entry', () => {
  const original = [
    meal('dinner', 'Dinner', [food('f1', 'Chicken', 100, 120, 22.5, 0, 2.6)]),
    meal('post', 'Post-Workout', [])
  ]
  const draft = [
    meal('dinner', 'Dinner', []),
    meal('post', 'Post-Workout', [food('f1', 'Chicken', 150, 180, 33.75, 0, 3.9)])
  ]

  const changes = diffMeals(original, draft)
  assert.strictEqual(changes.length, 2)
  const types = changes.map(c => c.type).sort()
  assert.deepStrictEqual(types, ['increased', 'moved'])
})

test('moveFood - relocates the food to the target meal, preserving quantity and macros exactly', () => {
  const chicken = food('f1', 'Chicken Breast', 150, 180, 33.75, 0, 3.9)
  const meals = [
    meal('dinner', 'Dinner', [chicken]),
    meal('post', 'Post-Workout', [])
  ]

  const result = moveFood(meals, 'dinner', 'f1', 'post')
  const dinner = result.find(m => m.id === 'dinner')!
  const post = result.find(m => m.id === 'post')!

  assert.strictEqual(dinner.foods.length, 0)
  assert.strictEqual(post.foods.length, 1)
  assert.deepStrictEqual(post.foods[0], chicken, 'quantity/unit/macros must be carried over unchanged')
})

test('moveFood - recalculating totals after a move shows the macros on the new meal, not the old one', () => {
  const chicken = food('f1', 'Chicken Breast', 150, 180, 33.75, 0, 3.9)
  const meals = [
    meal('dinner', 'Dinner', [chicken]),
    meal('post', 'Post-Workout', [])
  ]

  const result = moveFood(meals, 'dinner', 'f1', 'post')
  const dinnerTotals = computeMealTotals(result.find(m => m.id === 'dinner')!)
  const postTotals = computeMealTotals(result.find(m => m.id === 'post')!)

  assert.deepStrictEqual(dinnerTotals, { calories: 0, protein: 0, carbs: 0, fat: 0 })
  assert.strictEqual(postTotals.calories, 180)
  assert.strictEqual(postTotals.protein, 33.75)

  // Daily totals are unaffected by which meal a food sits in.
  assert.deepStrictEqual(computeDailyTotals(meals), computeDailyTotals(result))
})

test('moveFood - is a no-op when the source and target meal are the same', () => {
  const meals = [meal('dinner', 'Dinner', [food('f1', 'Chicken', 150, 180, 33.75, 0, 3.9)])]
  const result = moveFood(meals, 'dinner', 'f1', 'dinner')
  assert.strictEqual(result, meals)
})

test('moveFood - is a no-op when the food id does not exist in the source meal', () => {
  const meals = [
    meal('dinner', 'Dinner', [food('f1', 'Chicken', 150, 180, 33.75, 0, 3.9)]),
    meal('post', 'Post-Workout', [])
  ]
  const result = moveFood(meals, 'dinner', 'does-not-exist', 'post')
  assert.deepStrictEqual(result, meals)
})

test('moveFood - is a no-op when the target meal does not exist', () => {
  const meals = [meal('dinner', 'Dinner', [food('f1', 'Chicken', 150, 180, 33.75, 0, 3.9)])]
  const result = moveFood(meals, 'dinner', 'f1', 'does-not-exist')
  assert.deepStrictEqual(result, meals)
})

test('removeMeal - deletes the named meal and every food in it, leaving the rest in order', () => {
  const meals = [
    meal('b', 'Breakfast', [food('f1', 'Oats', 80, 300, 10, 55, 5)]),
    meal('l', 'Lunch', [food('f2', 'Chicken', 200, 330, 62, 0, 7)]),
    meal('d', 'Dinner', [food('f3', 'Rice', 150, 200, 4, 44, 0)]),
    meal('pw', 'Pre-Workout', [food('f4', 'Banana', 120, 105, 1, 27, 0)])
  ]
  const result = removeMeal(meals, 'pw')
  assert.deepStrictEqual(result.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner'])
  assert.ok(!result.some(m => m.foods.some(f => f.id === 'f4')), 'the removed meal\'s food is gone too')
  // The surviving meals are the exact same objects, untouched.
  assert.strictEqual(result[0], meals[0])
  assert.strictEqual(result[1], meals[1])
  assert.strictEqual(result[2], meals[2])
})

test('removeMeal - removing a middle meal preserves the original order of the rest', () => {
  const meals = [
    meal('b', 'Breakfast', []),
    meal('l', 'Lunch', []),
    meal('d', 'Dinner', []),
    meal('pw', 'Pre-Workout', [])
  ]
  assert.deepStrictEqual(
    removeMeal(meals, 'l').map(m => m.name),
    ['Breakfast', 'Dinner', 'Pre-Workout']
  )
})

test('removeMeal - is a no-op (same reference) when the id is not present, and never adds a meal', () => {
  const meals = [meal('b', 'Breakfast', []), meal('l', 'Lunch', [])]
  assert.strictEqual(removeMeal(meals, 'nope'), meals)
  assert.strictEqual(removeMeal(meals, 'b').length, 1, 'exactly one fewer meal - nothing is recreated')
})

test('removeMeal - daily totals immediately drop the removed meal\'s contribution and nothing else', () => {
  const meals = [
    meal('b', 'Breakfast', [food('f1', 'Oats', 80, 300, 10, 55, 5)]),
    meal('l', 'Lunch', [food('f2', 'Chicken', 200, 330, 62, 0, 7)]),
    meal('pw', 'Pre-Workout', [food('f3', 'Banana', 120, 105, 1, 27, 0)])
  ]
  const before = computeDailyTotals(meals)
  assert.deepStrictEqual(before, { calories: 735, protein: 73, carbs: 82, fat: 12 })

  const after = computeDailyTotals(removeMeal(meals, 'pw'))
  // Exactly Breakfast + Lunch - the Pre-Workout banana no longer counts,
  // and nothing was rebalanced to compensate.
  assert.deepStrictEqual(after, { calories: 630, protein: 72, carbs: 55, fat: 12 })
})

function fiveMeals() {
  return [
    meal('b', 'Breakfast', [food('f1', 'Oats', 80, 300, 10, 55, 5)]),
    meal('l', 'Lunch', [food('f2', 'Chicken', 200, 330, 62, 0, 7)]),
    meal('d', 'Dinner', [food('f3', 'Rice', 150, 200, 4, 44, 0)]),
    meal('pw', 'Pre-Workout', [food('f4', 'Banana', 120, 105, 1, 27, 0)]),
    meal('post', 'Post-Workout', [food('f5', 'Whey', 30, 120, 24, 3, 1)])
  ]
}

test('moveMeal - up swaps only the meal with the one before it; every other meal is the same object', () => {
  const meals = fiveMeals()
  const result = moveMeal(meals, 'pw', 'up') // Pre-Workout (idx 3) <-> Dinner (idx 2)
  assert.deepStrictEqual(result.map(m => m.name), ['Breakfast', 'Lunch', 'Pre-Workout', 'Dinner', 'Post-Workout'])
  assert.strictEqual(result[0], meals[0])
  assert.strictEqual(result[1], meals[1])
  assert.strictEqual(result[4], meals[4])
  // The two swapped meals are the exact same objects, just repositioned.
  assert.strictEqual(result[2], meals[3])
  assert.strictEqual(result[3], meals[2])
})

test('moveMeal - down swaps only the meal with the one after it', () => {
  const meals = fiveMeals()
  const result = moveMeal(meals, 'l', 'down') // Lunch (idx 1) <-> Dinner (idx 2)
  assert.deepStrictEqual(result.map(m => m.name), ['Breakfast', 'Dinner', 'Lunch', 'Pre-Workout', 'Post-Workout'])
})

test('moveMeal - moving the first meal up is a no-op (same reference)', () => {
  const meals = fiveMeals()
  assert.strictEqual(moveMeal(meals, 'b', 'up'), meals)
})

test('moveMeal - moving the last meal down is a no-op (same reference)', () => {
  const meals = fiveMeals()
  assert.strictEqual(moveMeal(meals, 'post', 'down'), meals)
})

test('moveMeal - an unknown meal id is a no-op (same reference)', () => {
  const meals = fiveMeals()
  assert.strictEqual(moveMeal(meals, 'nope', 'up'), meals)
  assert.strictEqual(moveMeal(meals, 'nope', 'down'), meals)
})

test('moveMeal - moving a middle meal leaves all non-adjacent meals in their original order', () => {
  const meals = fiveMeals()
  const result = moveMeal(meals, 'd', 'up') // Dinner up: B, L, D, PW, Post -> B, D, L, PW, Post
  assert.deepStrictEqual(result.map(m => m.name), ['Breakfast', 'Dinner', 'Lunch', 'Pre-Workout', 'Post-Workout'])
  assert.strictEqual(result[0], meals[0])
  assert.strictEqual(result[3], meals[3])
  assert.strictEqual(result[4], meals[4])
})

test('moveMeal - meal contents (foods, quantities, units, macros) are byte-identical after a move', () => {
  const meals = fiveMeals()
  const before = JSON.parse(JSON.stringify(meals))
  const result = moveMeal(meals, 'post', 'up')
  // Same set of meals by name, same foods inside each, nothing renamed.
  for (const original of before) {
    const moved = result.find(m => m.id === original.id)
    assert.ok(moved, `${original.name} still present`)
    assert.deepStrictEqual(moved, original, `${original.name} unchanged`)
  }
})

test('moveMeal - no meal is duplicated or lost by repeated moves', () => {
  let meals = fiveMeals()
  meals = moveMeal(meals, 'post', 'up')
  meals = moveMeal(meals, 'post', 'up')
  meals = moveMeal(meals, 'b', 'down')
  meals = moveMeal(meals, 'b', 'up') // back where it started
  assert.deepStrictEqual([...meals.map(m => m.id)].sort(), ['b', 'd', 'l', 'post', 'pw'])
  assert.strictEqual(new Set(meals.map(m => m.id)).size, 5)
})

test('moveMeal - daily nutrition totals are identical before and after a reorder', () => {
  const meals = fiveMeals()
  assert.deepStrictEqual(computeDailyTotals(moveMeal(meals, 'pw', 'up')), computeDailyTotals(meals))
})

test('moveMeal - explicit spec scenario: Post-Workout up one, then Pre-Workout up two', () => {
  let meals = fiveMeals() // Breakfast, Lunch, Dinner, Pre-Workout, Post-Workout
  const totals = computeDailyTotals(meals)

  meals = moveMeal(meals, 'post', 'up')
  assert.deepStrictEqual(meals.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner', 'Post-Workout', 'Pre-Workout'])

  meals = moveMeal(meals, 'pw', 'up')
  meals = moveMeal(meals, 'pw', 'up')
  assert.deepStrictEqual(meals.map(m => m.name), ['Breakfast', 'Lunch', 'Pre-Workout', 'Dinner', 'Post-Workout'])

  // Every meal's foods/quantities/macros are untouched; only order changed.
  assert.deepStrictEqual(meals.find(m => m.id === 'pw')!.foods, fiveMeals()[3].foods)
  assert.deepStrictEqual(meals.find(m => m.id === 'post')!.foods, fiveMeals()[4].foods)
  assert.deepStrictEqual(computeDailyTotals(meals), totals)
})

test('moveMeal - composes with removeMeal: remove a meal, then reorder the rest', () => {
  let meals = fiveMeals()
  meals = removeMeal(meals, 'pw')
  meals = moveMeal(meals, 'post', 'up') // Post-Workout above Dinner
  assert.deepStrictEqual(meals.map(m => m.name), ['Breakfast', 'Lunch', 'Post-Workout', 'Dinner'])
})

test('moveMeal - composes with an added meal: append, then reorder it into place', () => {
  let meals = fiveMeals()
  meals = [...meals, meal('snack', 'Snack', [])]
  meals = moveMeal(meals, 'snack', 'up')
  meals = moveMeal(meals, 'snack', 'up')
  assert.deepStrictEqual(meals.map(m => m.name), ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-Workout', 'Post-Workout'])
})

test('computeMealTotals - sums foods within a meal (macro recalculation)', () => {
  const m = meal('m1', 'Lunch', [
    food('f1', 'Chicken', 200, 240, 45, 0, 5.2),
    food('f2', 'Rice', 100, 365, 7.1, 80, 0.7)
  ])
  const totals = computeMealTotals(m)
  assert.strictEqual(totals.calories, 605)
  assert.strictEqual(totals.protein, 52.1)
  assert.strictEqual(totals.carbs, 80)
  assert.strictEqual(totals.fat, 5.9)
})

test('computeDailyTotals - sums across all meals (daily calorie recalculation)', () => {
  const meals = [
    meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)]),
    meal('m2', 'Lunch', [food('f2', 'Chicken', 200, 240, 45, 0, 5.2)])
  ]
  const totals = computeDailyTotals(meals)
  assert.strictEqual(totals.calories, 383)
  assert.strictEqual(Math.round(totals.protein * 10) / 10, 57.6)
})

test('diffMeals - change summary reflects multiple simultaneous edits', () => {
  const original = [
    meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5), food('f2', 'Toast', 50, 130, 4, 25, 1)]),
    meal('m2', 'Lunch', [])
  ]
  const draft = [
    meal('m1', 'Breakfast', [food('f1', 'Eggs', 150, 214.5, 18.9, 1.05, 14.25)]), // increased, Toast removed
    meal('m2', 'Lunch', [food('new-1', 'Banana', 100, 89, 1.1, 22.8, 0.3)]) // added
  ]

  const changes = diffMeals(original, draft)
  const types = changes.map(c => c.type).sort()
  assert.deepStrictEqual(types, ['added', 'increased', 'removed'])
})

test('diffMeals - discarding changes (reverting draft to original) yields zero changes', () => {
  const original = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)])]
  const edited = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 300, 429, 37.8, 2.1, 28.5)])]
  assert.notDeepStrictEqual(diffMeals(original, edited), [])

  // Discard reverts draft back to a copy of original.
  const discarded = original.map(m => ({ ...m, foods: m.foods.map(f => ({ ...f })) }))
  assert.deepStrictEqual(diffMeals(original, discarded), [])
})

test('diffMeals - undo (reverting to the previous snapshot) restores the prior diff exactly', () => {
  const original = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)])]
  const afterRemoval = [meal('m1', 'Breakfast', [])]
  assert.strictEqual(diffMeals(original, afterRemoval)[0].type, 'removed')

  // Undo pops back to the pre-removal snapshot (a deep copy taken before the
  // mutation, exactly as DietEditor's history stack does).
  const undone = original.map(m => ({ ...m, foods: m.foods.map(f => ({ ...f })) }))
  assert.deepStrictEqual(diffMeals(original, undone), [])
})

test('getFoodBadges - returns the applicable badges for a given food id', () => {
  const original = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)])]
  const draft = [meal('m1', 'Breakfast', [food('f1', 'Eggs', 150, 214.5, 18.9, 1.05, 14.25)])]
  const changes = diffMeals(original, draft)
  assert.deepStrictEqual(getFoodBadges(changes, 'f1'), ['increased'])
  assert.deepStrictEqual(getFoodBadges(changes, 'nonexistent'), [])
})

test('classifyTarget - on target / slightly over / over thresholds', () => {
  assert.strictEqual(classifyTarget(2260, 2250).status, 'on-target') // +0.4%
  assert.strictEqual(classifyTarget(2400, 2250).status, 'slightly-over') // +6.7%
  assert.strictEqual(classifyTarget(2100, 2250).status, 'slightly-under') // -6.7%
  assert.strictEqual(classifyTarget(2700, 2250).status, 'over') // +20%
  assert.strictEqual(classifyTarget(1800, 2250).status, 'under') // -20%
})

test('uniqueMealName - a genuinely new name is returned unchanged', () => {
  assert.strictEqual(uniqueMealName(['Breakfast', 'Lunch'], 'Dinner'), 'Dinner')
})

test('uniqueMealName - a duplicate name gets a " (2)" suffix, never silently allowed as-is', () => {
  assert.strictEqual(uniqueMealName(['Breakfast', 'Lunch'], 'Breakfast'), 'Breakfast (2)')
})

test('uniqueMealName - the collision check is case-insensitive', () => {
  assert.strictEqual(uniqueMealName(['breakfast'], 'Breakfast'), 'Breakfast (2)')
})

test('uniqueMealName - finds the first free suffix when several numbered duplicates already exist', () => {
  assert.strictEqual(uniqueMealName(['Snack', 'Snack (2)', 'Snack (3)'], 'Snack'), 'Snack (4)')
})

test('uniqueMealName - trims whitespace before comparing and before returning', () => {
  assert.strictEqual(uniqueMealName(['Breakfast'], '  Breakfast  '), 'Breakfast (2)')
})

test('defaultMealNamesForCount - the "Meals Per Day" selector actually determines how many meals are seeded', () => {
  assert.strictEqual(defaultMealNamesForCount(3).length, 3)
  assert.strictEqual(defaultMealNamesForCount(4).length, 4)
  assert.strictEqual(defaultMealNamesForCount(5).length, 5)
  assert.strictEqual(defaultMealNamesForCount(6).length, 6)
})

test('defaultMealNamesForCount - every returned name is distinct, no accidental duplicates', () => {
  for (const count of [3, 4, 5, 6]) {
    const names = defaultMealNamesForCount(count)
    assert.strictEqual(new Set(names).size, names.length, `count=${count} produced duplicate names: ${names.join(', ')}`)
  }
})

test('defaultMealNamesForCount - falls back to numbered names for a count outside the offered 3-6 options', () => {
  assert.deepStrictEqual(defaultMealNamesForCount(8), ['Meal 1', 'Meal 2', 'Meal 3', 'Meal 4', 'Meal 5', 'Meal 6', 'Meal 7', 'Meal 8'])
})
