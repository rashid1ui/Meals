import type { SupabaseClient } from '@supabase/supabase-js'
import { computeSupplementMacros, buildSupplementCatalogName, classifySupplementInsertError } from './supplements'
import type { SupplementSetup } from '@/lib/types'

// Idempotent create-or-reuse of a food_database row representing exactly one
// user's configured supplement. Extracted out of app/onboarding/actions.ts
// (the AI path's original, only caller) so the EXACT same
// catalog-identity/collision-avoidance logic (buildSupplementCatalogName's
// brand+type+serving-number distinguisher) also backs the Manual Meal
// Builder path (app/onboarding/manual-actions.ts's ensureManualSupplementFoods)
// instead of the manual path silently never creating this row at all - a
// user's manually configured whey/creatine now resolves to the SAME row an
// equivalent AI-path configuration would, and two different users' distinct
// configurations never collide into the wrong macros (the name always
// encodes the exact serving numbers, not just brand/type).
//
// System-generated rows are always category='supplement', protein_type=
// 'supplement', is_active=false - hidden from the normal food picker's
// is_active=true filter and the AI's own candidate-food filter, visible only
// via the dedicated supplement RLS SELECT clause
// (0014_food_database_supplement_select_rls.sql) and the food picker's own
// Supplements tab.
export interface EnsuredSupplementFood {
  foodId: string
  name: string
  category: 'supplement'
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  protein_type: 'supplement'
  display_unit: 'serving'
  grams_per_display_unit: number
}

// Same escaping helper duplicated locally in app/onboarding/actions.ts and
// app/dashboard/food-actions.ts - kept private here rather than centralized,
// to avoid an unrelated cross-module refactor outside this fix's scope.
function escapeForIlike(value: string): string {
  return value.replace(/[%_\\]/g, ch => `\\${ch}`)
}

export async function ensureSupplementCatalogRow(
  supabase: SupabaseClient,
  supp: SupplementSetup
): Promise<{ data: EnsuredSupplementFood } | { error: string }> {
  const computed = computeSupplementMacros(supp)
  // Encodes brand + type + the actual serving numbers, not just type+brand -
  // two users configuring "generic Whey Protein" with different
  // protein-per-scoop amounts get distinct catalog rows instead of silently
  // colliding on (and inheriting) each other's macros.
  const suppName = buildSupplementCatalogName(supp, computed)

  const proteinPer100 = computed.quantity > 0 ? (computed.protein / computed.quantity) * 100 : 0
  const caloriesPer100 = computed.quantity > 0 ? (computed.calories / computed.quantity) * 100 : 0
  const carbsPer100 = computed.quantity > 0 ? (computed.carbs / computed.quantity) * 100 : 0
  const fatPer100 = computed.quantity > 0 ? (computed.fat / computed.quantity) * 100 : 0

  const { data: existingSupp, error: lookupError } = await supabase
    .from('food_database')
    .select('id')
    .ilike('name', escapeForIlike(suppName))
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    console.error('[supplement-catalog] food_database lookup failed:', lookupError)
    return { error: `Failed to look up your ${supp.type} supplement. Please try again.` }
  }

  let suppFoodId: string | null = existingSupp?.id ?? null
  if (!suppFoodId) {
    const { data: newSupp, error: insertError } = await supabase
      .from('food_database')
      .insert({
        name: suppName,
        category: 'supplement',
        protein_type: 'supplement',
        serving_size: 100,
        serving_unit: 'grams',
        calories: caloriesPer100,
        protein: proteinPer100,
        carbs: carbsPer100,
        fat: fatPer100,
        display_unit: 'serving',
        grams_per_display_unit: computed.quantity,
        is_active: false
      })
      .select('id')
      .single()

    const errorClass = classifySupplementInsertError(insertError)
    if (errorClass === 'unique_violation') {
      // Lost a create race to another request for the exact same
      // configuration (same user re-submitting, or - in principle - a
      // different user with an identical config) - reuse the winner rather
      // than erroring.
      const { data: raceWinner, error: raceLookupError } = await supabase
        .from('food_database')
        .select('id')
        .ilike('name', escapeForIlike(suppName))
        .maybeSingle()
      if (raceLookupError) {
        console.error('[supplement-catalog] post-race food_database lookup failed:', raceLookupError)
        return { error: `Failed to save your ${supp.type} supplement. Please try again.` }
      }
      suppFoodId = raceWinner?.id ?? null
    } else if (errorClass === 'fatal') {
      // Never silently continue past a real database failure (e.g. a
      // CHECK-constraint violation) - fail loudly instead of dropping the
      // supplement while still reporting success.
      console.error('[supplement-catalog] food_database insert failed:', insertError)
      return { error: `Failed to save your ${supp.type} supplement. Please try again.` }
    } else {
      suppFoodId = newSupp?.id ?? null
    }

    if (!suppFoodId) {
      console.error('[supplement-catalog] food_database insert returned no id and no error')
      return { error: `Failed to save your ${supp.type} supplement. Please try again.` }
    }
  }

  return {
    data: {
      foodId: suppFoodId,
      name: suppName,
      category: 'supplement',
      serving_size: 100,
      serving_unit: 'grams',
      calories: caloriesPer100,
      protein: proteinPer100,
      carbs: carbsPer100,
      fat: fatPer100,
      protein_type: 'supplement',
      display_unit: 'serving',
      grams_per_display_unit: computed.quantity
    }
  }
}
