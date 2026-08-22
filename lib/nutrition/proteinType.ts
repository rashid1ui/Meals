// Protein-source classification - animal / plant / supplement. Pure,
// framework-free (no Supabase, no 'use server'), same pattern as this
// directory's other modules (engine.ts/calculator.ts/units.ts).
//
// food_database.protein_type (supabase/migrations/0007_training_nutrition.sql)
// is the authoritative classification for catalog foods. This module's
// classifyProteinType() is only the FALLBACK used when a food has no
// food_database match at all (a custom/AI-named food, or a food_database row
// added before this migration's backfill) - so every food always ends up in
// exactly one bucket, and animal + plant + supplement always reconciles
// exactly to total protein (never silently drops a food's protein).

export type ProteinType = 'animal' | 'plant' | 'supplement'

export interface ProteinBreakdown {
  animal: number
  plant: number
  supplement: number
}

export function zeroProteinBreakdown(): ProteinBreakdown {
  return { animal: 0, plant: 0, supplement: 0 }
}

// Recommended range for a gym user, informational only (never enforced) -
// see the spec's "protein ratio recommendation" section.
export const RECOMMENDED_ANIMAL_PROTEIN_PCT: [number, number] = [70, 80]
export const RECOMMENDED_PLANT_PROTEIN_PCT: [number, number] = [20, 30]

// Keyword-based fallback classifier. Checked in order - supplement keywords
// first (a product name like "ON Gold Standard Whey" would otherwise match
// nothing below), then animal, then plant. Category is used only as a last
// resort when no keyword matches, mirroring the same category groupings
// FoodStep.tsx already uses to bucket foods into Protein/Carbs/Fat steps.
const SUPPLEMENT_KEYWORDS = ['whey', 'casein', 'protein powder', 'protein shake', 'isolate', 'mass gainer']
const ANIMAL_KEYWORDS = [
  'chicken', 'beef', 'turkey', 'salmon', 'egg', 'tilapia', 'tuna', 'bison', 'pork', 'fish',
  'shrimp', 'bacon', 'ham', 'sausage', 'yogurt', 'milk', 'cheese', 'cottage', 'butter', 'cream'
]
const PLANT_KEYWORDS = [
  'oat', 'rice', 'bean', 'lentil', 'nut', 'bread', 'tofu', 'tempeh', 'quinoa', 'pasta',
  'potato', 'chickpea', 'seed', 'soy', 'fruit', 'banana', 'apple', 'berry', 'orange', 'avocado', 'vegetable'
]

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some(k => haystack.includes(k))
}

export function classifyProteinType(name: string, category?: string | null): ProteinType {
  const n = name.toLowerCase()

  if (matchesAny(n, SUPPLEMENT_KEYWORDS)) return 'supplement'
  if (matchesAny(n, ANIMAL_KEYWORDS)) return 'animal'
  if (matchesAny(n, PLANT_KEYWORDS)) return 'plant'

  const c = (category || '').toLowerCase().trim()
  if (c === 'protein' || c === 'dairy') return 'animal'
  return 'plant'
}

export interface ProteinSourceFood {
  name: string
  protein: number
}

// Splits a set of foods' protein grams into animal/plant/supplement buckets.
// `lookup` maps a food's exact name (matching food_database.name, the same
// identity basis the rest of the app uses - see app/dashboard/page.tsx's
// foodDatabaseByName) to its authoritative protein_type; classifyProteinType
// is only the fallback for names with no catalog match. The three buckets
// always sum to exactly the input foods' total protein.
export function splitProteinByType(
  foods: ProteinSourceFood[],
  lookup: ReadonlyMap<string, ProteinType | null | undefined>,
  categoryLookup?: ReadonlyMap<string, string | null | undefined>
): ProteinBreakdown {
  const totals = zeroProteinBreakdown()
  for (const food of foods) {
    const known = lookup.get(food.name)
    const type = known ?? classifyProteinType(food.name, categoryLookup?.get(food.name))
    totals[type] += food.protein
  }
  return totals
}
