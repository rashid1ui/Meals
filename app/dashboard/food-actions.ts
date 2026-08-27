'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import {
  requiresGramsPerUnit,
  fixedGramsPerUnit,
  isValidGramsPerUnit,
  canonicalServingUnitFor,
  servingSizeFor,
  DISPLAY_UNIT_OPTIONS
} from '@/lib/nutrition/units'
import type { FoodOption } from './components/DietEditor'

const ALLOWED_CATEGORIES = ['protein', 'dairy', 'carbohydrate', 'fruit', 'vegetable', 'fat', 'supplement']
const ALLOWED_DISPLAY_UNITS = DISPLAY_UNIT_OPTIONS.map(o => o.value)
const ALLOWED_PROTEIN_TYPES = ['animal', 'plant', 'supplement']
const MAX_NUTRITION_PER_100 = 2000

const FOOD_OPTION_COLUMNS = 'id, name, serving_size, serving_unit, calories, protein, carbs, fat, category, display_unit, grams_per_display_unit'

// ilike treats % and _ as wildcards - escape them so a name containing
// either (e.g. an existing "2% Milk") is matched literally, not as a
// pattern.
function escapeForIlike(value: string): string {
  return value.replace(/[%_\\]/g, ch => `\\${ch}`)
}

export type CreateFoodInput = {
  name: string
  category: string
  displayUnit: string
  gramsPerDisplayUnit: number | null // required for piece/slice/serving, ignored otherwise
  // For displayUnit 'g'/'kg'/'ml' these are per 100g/100ml, matching the
  // existing weight-based catalog convention exactly. For a piece-like unit
  // (piece/slice/serving) these are per ONE of that unit instead (e.g. "25g
  // protein per scoop") - entered directly, not derived from a per-100g
  // figure, since a serving-based product's own label already states
  // nutrition per scoop/serving and forcing a per-100g conversion is both
  // unnecessary and error-prone for the user. See serving_size below.
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
  proteinType: string
}

type Result = { data: FoodOption } | { error: string }

// Adds a new SHARED catalog food (food_database has no per-user scoping -
// every user's meal generation reads from this same table). Only reachable
// by an authenticated user (RLS: "Authenticated users can add foods",
// migration 0003_food_display_units.sql) - never trust a client-supplied
// user_id since this table doesn't even have one.
export async function createFoodDatabaseEntry(input: CreateFoodInput): Promise<Result> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = input.name.trim()
  if (!name) return { error: 'Please enter a food name.' }

  if (!ALLOWED_CATEGORIES.includes(input.category)) {
    return { error: 'Please select a valid category.' }
  }

  if (!ALLOWED_DISPLAY_UNITS.includes(input.displayUnit as (typeof ALLOWED_DISPLAY_UNITS)[number])) {
    return { error: 'Please select a valid measurement unit.' }
  }

  if (!ALLOWED_PROTEIN_TYPES.includes(input.proteinType)) {
    return { error: 'Please select a valid protein type.' }
  }

  let gramsPerDisplayUnit = fixedGramsPerUnit(input.displayUnit)
  if (gramsPerDisplayUnit === null) {
    // piece / slice / serving - the creator must supply this explicitly;
    // there is no universal "1 piece = Xg" to assume.
    if (!requiresGramsPerUnit(input.displayUnit)) {
      return { error: 'Unsupported measurement unit.' }
    }
    if (input.gramsPerDisplayUnit === null || !isValidGramsPerUnit(input.gramsPerDisplayUnit)) {
      return { error: 'Please enter a valid weight per unit (greater than 0, and realistic).' }
    }
    gramsPerDisplayUnit = input.gramsPerDisplayUnit
  }

  const nutritionFields = [input.caloriesPer100, input.proteinPer100, input.carbsPer100, input.fatPer100]
  for (const value of nutritionFields) {
    if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > MAX_NUTRITION_PER_100) {
      return { error: 'Please enter valid nutrition values (0 or greater).' }
    }
  }

  const servingUnit = canonicalServingUnitFor(input.displayUnit)
  const servingSize = servingSizeFor(input.displayUnit, gramsPerDisplayUnit)

  const supabase = await createClient()

  // food_database is a single shared, unscoped catalog (see comment above) -
  // reuse an existing ACTIVE row with the same name (case-insensitive)
  // instead of forking the catalog. This is what makes repeat "Add Custom
  // Food" submissions of the same food idempotent instead of piling up
  // duplicates the AI would have to disambiguate between.
  //
  // is_active=true is required here (not just a name match) - a
  // soft-deleted row (e.g. a deprecated/removed default food, or a
  // system-generated supplement row hidden by design) must never be
  // silently reused/resurrected just because its name collides with what
  // the user is trying to (re)create. Every reuse path below (this lookup,
  // the explicit inactive-name check, and the insert-race fallback) is
  // scoped to is_active=true for the same reason.
  const { data: existingActive, error: existingActiveError } = await supabase
    .from('food_database')
    .select(FOOD_OPTION_COLUMNS)
    .ilike('name', escapeForIlike(name))
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existingActiveError) {
    console.error('[food-actions] createFoodDatabaseEntry: active-food lookup failed:', existingActiveError)
    return { error: 'Failed to check for an existing food. Please try again.' }
  }

  if (existingActive) {
    return { data: existingActive as FoodOption }
  }

  // A soft-deleted row can still collide on the unique food_database.name
  // index even though it didn't match above (is_active has no exception in
  // that index) - detect this BEFORE attempting the insert, with a clear,
  // specific, actionable message, instead of either a generic insert
  // failure or - the actual bug being fixed here - silently resurrecting
  // the inactive row as if it were a normal, valid food. This is also what
  // stops the failure from surfacing only much later, at final "Create
  // Plan" validation, with no indication of which food caused it.
  const { data: existingInactive, error: existingInactiveError } = await supabase
    .from('food_database')
    .select('id')
    .ilike('name', escapeForIlike(name))
    .eq('is_active', false)
    .limit(1)
    .maybeSingle()

  if (existingInactiveError) {
    console.error('[food-actions] createFoodDatabaseEntry: inactive-food lookup failed:', existingInactiveError)
    return { error: 'Failed to check for an existing food. Please try again.' }
  }

  if (existingInactive) {
    return {
      error: `"${name}" already exists in the catalog but is no longer active, so it can't be reused automatically. Please choose a different, more specific name (e.g. add a brand or serving size) to create a distinct food.`
    }
  }

  const { data, error } = await supabase
    .from('food_database')
    .insert({
      name,
      category: input.category,
      serving_size: servingSize,
      serving_unit: servingUnit,
      calories: input.caloriesPer100,
      protein: input.proteinPer100,
      carbs: input.carbsPer100,
      fat: input.fatPer100,
      display_unit: input.displayUnit,
      grams_per_display_unit: gramsPerDisplayUnit,
      protein_type: input.proteinType,
      is_active: true
    })
    .select(FOOD_OPTION_COLUMNS)
    .single()

  if (error || !data) {
    // Unique-constraint race: another request inserted the exact same name
    // between our lookups above and this insert. Fetch and return that row
    // ONLY if it's active - if the race winner was somehow an inactive row
    // (the same class of edge case the checks above exist to catch), fall
    // back to the same clear "choose a different name" message rather than
    // ever returning an inactive row to the caller.
    if (error?.code === '23505') {
      const { data: raceWinner } = await supabase
        .from('food_database')
        .select(FOOD_OPTION_COLUMNS)
        .ilike('name', escapeForIlike(name))
        .eq('is_active', true)
        .maybeSingle()
      if (raceWinner) return { data: raceWinner as FoodOption }
      return {
        error: `"${name}" already exists in the catalog but is no longer active, so it can't be reused automatically. Please choose a different, more specific name (e.g. add a brand or serving size) to create a distinct food.`
      }
    }
    console.error('[food-actions] createFoodDatabaseEntry insert failed:', error)
    return { error: 'Failed to save the new food. Please try again.' }
  }

  return { data: data as FoodOption }
}
