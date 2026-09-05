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
//      ignoring quantity/order/tracking - see mealQuery.ts) - for any other
//      meal that has ALREADY been checked, whether that check succeeded
//      (resolved/representative) or came back with no confident match
//      (unresolved). Composition-key identity, not "does it have an
//      image_url", decides carry-forward: an already-unresolved meal whose
//      composition hasn't changed must stay unresolved and must NOT be
//      retried just because a different meal in the same save changed - see
//      the QA-reported "unresolved meal retried on unrelated save" fix.
//      Only a meal whose composition key has no match at all here - a
//      genuinely new/never-checked meal - is eligible for a fresh
//      resolution attempt.

import { mealCompositionKey, type MealFoodRef } from './mealQuery'

export type CarriedMealImage = {
  image_url: string | null
  image_alt: string | null
  image_attribution: unknown
  image_status: string | null
  // Preserved verbatim across a carry-forward - an untouched meal's
  // "when was this last checked" must never reset just because a save
  // happened. Only a genuine new resolution attempt sets a new value.
  image_checked_at: string | null
}

export type PriorMeal = {
  id: string
  name: string
  foods: readonly MealFoodRef[]
  image_url: string | null
  image_alt: string | null
  image_attribution: unknown
  image_status: string | null
  image_checked_at: string | null
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
    const carried: CarriedMealImage = {
      image_url: m.image_url,
      image_alt: m.image_alt,
      image_attribution: m.image_attribution,
      image_status: m.image_status,
      image_checked_at: m.image_checked_at
    }

    if (m.image_status === 'user_provided') {
      userProvidedByMealId.set(m.id, carried)
      continue // never eligible for composition-key matching either
    }

    // Index this meal's composition when it has EITHER a stored image
    // (resolved/representative) OR was already attempted and came back
    // unresolved. A meal with neither (image_status is null/'pending' and
    // no image_url) has never actually been checked, so it is deliberately
    // left OUT of the index - a genuinely new/never-checked composition
    // must still get its first resolution attempt.
    if (m.image_url || m.image_status === 'unresolved') {
      const key = m.image_composition_key || mealCompositionKey(m.name, m.foods)
      imageByCompositionKey.set(key, carried)
    }
  }

  return { userProvidedByMealId, imageByCompositionKey }
}

export type MealImageCarryForwardDecision = {
  // The fingerprint to store on the newly-inserted row.
  compositionKey: string
  // Non-null -> copy these fields onto the new row verbatim, 0 API calls -
  // this includes an already-unresolved meal whose composition is
  // unchanged (image_url null, image_status 'unresolved'): it is carried
  // forward as still-unresolved, NOT rescheduled for another attempt.
  // Null -> genuinely new/never-checked composition: insert as
  // image_status='pending' and schedule a fresh resolution attempt.
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
