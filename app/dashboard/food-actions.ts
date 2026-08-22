'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import {
  requiresGramsPerUnit,
  fixedGramsPerUnit,
  isValidGramsPerUnit,
  canonicalServingUnitFor,
  DISPLAY_UNIT_OPTIONS
} from '@/lib/nutrition/units'
import type { FoodOption } from './components/DietEditor'

const ALLOWED_CATEGORIES = ['protein', 'dairy', 'carbohydrate', 'fruit', 'fat']
const ALLOWED_DISPLAY_UNITS = DISPLAY_UNIT_OPTIONS.map(o => o.value)
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
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
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

  const supabase = await createClient()

  // food_database is a single shared, unscoped catalog (see comment above) -
  // reuse an existing active row with the same name (case-insensitive)
  // instead of forking the catalog. This is what makes repeat "Add Custom
  // Food" submissions of the same food idempotent instead of piling up
  // duplicates the AI would have to disambiguate between.
  const { data: existing } = await supabase
    .from('food_database')
    .select(FOOD_OPTION_COLUMNS)
    .ilike('name', escapeForIlike(name))
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { data: existing as FoodOption }
  }

  const { data, error } = await supabase
    .from('food_database')
    .insert({
      name,
      category: input.category,
      serving_size: 100,
      serving_unit: servingUnit,
      calories: input.caloriesPer100,
      protein: input.proteinPer100,
      carbs: input.carbsPer100,
      fat: input.fatPer100,
      display_unit: input.displayUnit,
      grams_per_display_unit: gramsPerDisplayUnit,
      is_active: true
    })
    .select(FOOD_OPTION_COLUMNS)
    .single()

  if (error || !data) {
    // Unique-constraint race: another request inserted the exact same name
    // between our lookup above and this insert. Fetch and return that row
    // instead of failing the user's request.
    if (error?.code === '23505') {
      const { data: raceWinner } = await supabase
        .from('food_database')
        .select(FOOD_OPTION_COLUMNS)
        .ilike('name', escapeForIlike(name))
        .maybeSingle()
      if (raceWinner) return { data: raceWinner as FoodOption }
    }
    console.error('[food-actions] createFoodDatabaseEntry insert failed:', error)
    return { error: 'Failed to save the new food. Please try again.' }
  }

  return { data: data as FoodOption }
}
