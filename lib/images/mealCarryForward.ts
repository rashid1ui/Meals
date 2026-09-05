// Pure decision logic for meal-image "resolve once -> store -> reuse" across
// a dashboard save (app/dashboard/actions.ts's saveDietPlan, which deletes +
// reinserts every meal row on every save). Extracted out of that action so
// the exact carry-forward/re-resolve decision is directly unit-testable
// without a live database or session - see lib/images/mealCarryForward.test.ts.
//
// Two carry-forward paths, checked in order for each new meal:
//   1. BY MEAL ID (the client's currentId, same real id saveDietPlan already
//      uses to carry reminder_time/reminder_enabled forward) - ONLY for a
//      'user_provided' image. A human-set image must survive
//      UNCONDITIONALLY, even across a composition change - it is never
//      re-resolved and never dropped just because the foods changed.
//   2. BY COMPOSITION FINGERPRINT (slot type + the SET of food names,
//      ignoring quantity/order/tracking - see mealQuery.ts) - for an
//      automatically resolved/representative image. Only a meal whose food
//      composition actually changed gets a fresh resolution scheduled.

import { mealCompositionKey, type MealFoodRef } from './mealQuery'

export type CarriedMealImage = {
  image_url: string | null
  image_alt: string | null
  image_attribution: unknown
  image_status: string | null
}

export type PriorMeal = {
  id: string
  name: string
  foods: readonly MealFoodRef[]
  image_url: string | null
  image_alt: string | null
  image_attribution: unknown
  image_status: string | null
  image_composition_key?: string | null
}

export type MealImageCarryForwardIndex = {
  userProvidedByMealId: Map<string, CarriedMealImage>
  imageByCompositionKey: Map<string, CarriedMealImage>
}

// Builds the lookup index once per save from the CURRENT (about-to-be-
// replaced) meals.
export function buildMealImageCarryForwardIndex(priorMeals: readonly PriorMeal[]): MealImageCarryForwardIndex {
  const userProvidedByMealId = new Map<string, CarriedMealImage>()
  const imageByCompositionKey = new Map<string, CarriedMealImage>()

  for (const m of priorMeals) {
    if (!m.image_url && m.image_status !== 'user_provided') continue

    const carried: CarriedMealImage = {
      image_url: m.image_url,
      image_alt: m.image_alt,
      image_attribution: m.image_attribution,
      image_status: m.image_status
    }

    if (m.image_status === 'user_provided') {
      userProvidedByMealId.set(m.id, carried)
      continue // never eligible for composition-key matching either
    }

    const key = m.image_composition_key || mealCompositionKey(m.name, m.foods)
    imageByCompositionKey.set(key, carried)
  }

  return { userProvidedByMealId, imageByCompositionKey }
}

export type MealImageCarryForwardDecision = {
  // The fingerprint to store on the newly-inserted row.
  compositionKey: string
  // Non-null -> copy these fields onto the new row verbatim, 0 API calls.
  // Null -> insert as image_status='pending' and schedule fresh resolution.
  carriedImage: CarriedMealImage | null
}

// One meal's decision for the current save. `currentId` is the client's
// pre-existing DraftMeal id for an item it's editing (null/undefined for a
// brand-new meal - same convention as saveDietPlan's reminder carry-forward).
export function decideMealImageCarryForward(
  meal: { currentId?: string | null; name: string; foods: readonly MealFoodRef[] },
  index: MealImageCarryForwardIndex
): MealImageCarryForwardDecision {
  const compositionKey = mealCompositionKey(meal.name, meal.foods)

  const userProvidedImage = meal.currentId ? index.userProvidedByMealId.get(meal.currentId) : undefined
  const carriedImage = userProvidedImage ?? index.imageByCompositionKey.get(compositionKey) ?? null

  return { compositionKey, carriedImage }
}
