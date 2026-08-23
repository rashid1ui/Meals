// Carb-source classification - simple / complex. Pure, framework-free (no
// Supabase, no 'use server'), same pattern as lib/nutrition/proteinType.ts.
//
// food_database.carb_type (supabase/migrations/0016_food_database_carb_type.sql)
// is the authoritative classification for catalog foods. This module's
// classifyCarbType() is only the FALLBACK used when a food has no
// food_database match at all (a custom/AI-named food, or a food_database row
// added before this migration's backfill) - so every food always ends up in
// exactly one bucket, and simple + complex always reconciles exactly to
// total carbs.

export type CarbType = 'simple' | 'complex'

export interface CarbBreakdown {
  simple: number
  complex: number
}

export function zeroCarbBreakdown(): CarbBreakdown {
  return { simple: 0, complex: 0 }
}

// Keyword-based fallback classifier. Checked in order - simple-carb keywords
// first, then complex. Category is used only as a last resort when no
// keyword matches, mirroring proteinType.ts's own category fallback.
const SIMPLE_KEYWORDS = ['sugar', 'honey', 'juice', 'candy', 'white bread', 'soda', 'syrup', 'jam', 'jelly']
const COMPLEX_KEYWORDS = [
  'oat', 'brown rice', 'sweet potato', 'quinoa', 'legume', 'whole grain', 'whole wheat',
  'lentil', 'bean', 'chickpea', 'barley', 'farro'
]

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some(k => haystack.includes(k))
}

export function classifyCarbType(name: string, category?: string | null): CarbType {
  const n = name.toLowerCase()

  if (matchesAny(n, SIMPLE_KEYWORDS)) return 'simple'
  if (matchesAny(n, COMPLEX_KEYWORDS)) return 'complex'

  const c = (category || '').toLowerCase().trim()
  if (c === 'fruit') return 'simple'
  if (c === 'carbohydrate') return 'complex'
  return 'complex'
}

export interface CarbSourceFood {
  name: string
  carbs: number
}

// Splits a set of foods' carb grams into simple/complex buckets. `lookup`
// maps a food's exact name (matching food_database.name) to its
// authoritative carb_type; classifyCarbType is only the fallback for names
// with no catalog match. The two buckets always sum to exactly the input
// foods' total carbs.
export function splitCarbsByType(
  foods: CarbSourceFood[],
  lookup: ReadonlyMap<string, CarbType | null | undefined>,
  categoryLookup?: ReadonlyMap<string, string | null | undefined>
): CarbBreakdown {
  const totals = zeroCarbBreakdown()
  for (const food of foods) {
    const known = lookup.get(food.name)
    const type = known ?? classifyCarbType(food.name, categoryLookup?.get(food.name))
    totals[type] += food.carbs
  }
  return totals
}
