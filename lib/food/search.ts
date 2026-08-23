// Pure, framework-free food search matching (no Supabase, no 'use server') -
// same pattern as lib/nutrition/*.ts. Used by FoodPickerModal so a query
// searches the WHOLE catalog (name, category, and category synonyms) rather
// than only whatever category tab happens to be active - the actual cause of
// "I searched for banana and got nothing" (default tab was Protein).

export interface SearchableFood {
  name: string
  category?: string | null
}

// Generic synonyms per category value, not per-food special cases - lets a
// query like "carbs" or "protein" or "veggies" match every food in that
// category, and "whey"/"supplement"/"protein powder" reach the Supplements
// category, without hardcoding any single food's name.
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  protein: ['protein', 'proteins'],
  dairy: ['dairy'],
  carbohydrate: ['carb', 'carbs', 'carbohydrate', 'carbohydrates'],
  fruit: ['fruit', 'fruits'],
  vegetable: ['vegetable', 'vegetables', 'veggie', 'veggies', 'produce'],
  fat: ['fat', 'fats'],
  supplement: ['supplement', 'supplements', 'protein powder', 'whey', 'scoop']
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function matchesFoodQuery(food: SearchableFood, rawQuery: string): boolean {
  const q = normalize(rawQuery)
  if (!q) return true

  if (normalize(food.name).includes(q)) return true

  const category = food.category ? normalize(food.category) : ''
  if (!category) return false
  if (category.includes(q)) return true

  const synonyms = CATEGORY_SYNONYMS[category] || []
  return synonyms.some(s => s.includes(q) || q.includes(s))
}

export function searchFoods<T extends SearchableFood>(foods: T[], query: string): T[] {
  return foods.filter(f => matchesFoodQuery(f, query))
}
