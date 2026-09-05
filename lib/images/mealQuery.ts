// Pure meal-image query + composition-fingerprint logic.
// No Supabase, no network, no React.
//
// A meal's image is driven by its ACTUAL food composition plus its slot
// type - never the bare label ("Snack", "Pre-Workout"), which returns
// generic/unrelated photos. Every slot type is eligible and handled the
// same way (Breakfast, Lunch, Dinner, Snack, Pre-Workout, Post-Workout,
// custom). Resolve once -> store -> reuse:
//
//   mealCompositionKey() is a STABLE fingerprint of (slot-type token + the
//   SET of food identities). It deliberately ignores quantities, food
//   order, meal sort_order and tracking, so editing a quantity / reordering
//   / logging what you ate never changes it. The dashboard save path carries
//   the stored image forward whenever this key is unchanged; only a real
//   change of the meal's foods re-resolves that one meal's image.

// One food's identity + name as seen by the resolver. `foodDatabaseId` is
// null for a "locked" food whose name no longer matches an active catalog
// row (see lib/diet/diff.ts DraftFood) - we fall back to its normalised name.
export type MealFoodRef = {
  foodDatabaseId: string | null
  name: string
}

const TYPE_PATTERNS: [RegExp, string][] = [
  [/pre[\s-]?workout/i, 'pre-workout'],
  [/post[\s-]?workout/i, 'post-workout'],
  [/intra[\s-]?workout/i, 'intra-workout'],
  [/breakfast/i, 'breakfast'],
  [/brunch/i, 'brunch'],
  [/lunch/i, 'lunch'],
  [/dinner/i, 'dinner'],
  [/supper/i, 'dinner'],
  [/snack/i, 'snack'],
  [/dessert/i, 'dessert'],
  [/shake|smoothie/i, 'shake']
]

// Canonical slot token for a meal name. "Meal 2", "Meal #3", plain numbers
// or an unrecognised label collapse to 'meal' so a rename that keeps the
// same generic slot does not churn the fingerprint.
export function mealTypeToken(mealName: string): string {
  const name = (mealName || '').trim()
  for (const [re, token] of TYPE_PATTERNS) {
    if (re.test(name)) return token
  }
  return 'meal'
}

// A short descriptive phrase for the slot, used only inside the Pexels
// query (composition still leads).
function typePhrase(token: string): string {
  switch (token) {
    case 'pre-workout':
      return 'pre workout meal'
    case 'post-workout':
      return 'post workout protein shake'
    case 'intra-workout':
      return 'workout drink'
    case 'shake':
      return 'protein shake smoothie'
    case 'breakfast':
      return 'breakfast plate'
    case 'brunch':
      return 'brunch plate'
    case 'snack':
      return 'healthy snack plate'
    case 'dessert':
      return 'healthy dessert bowl'
    case 'lunch':
    case 'dinner':
      return `${token} plate meal`
    default:
      return 'balanced meal plate'
  }
}

const FOOD_NOISE = new Set([
  'raw', 'cooked', 'dry', 'dried', 'fresh', 'frozen', 'canned', 'lowfat',
  'nonfat', 'skim', 'lean', 'light', 'unsalted', 'salted', 'in', 'water',
  'and', 'with', 'the', 'of', 'g', 'ml', 'per', 'serving', 'scoop'
])

// The most identifying word of a single food name - the last meaningful
// word of the part before the first comma ("Chicken Breast, Cooked" ->
// "breast"; "Rolled Oats, Dry" -> "oats"). Mirrors primaryFoodNoun's
// intent from lib/food/foodImageQuery.ts, kept local so this module stays
// dependency-free.
export function foodNoun(name: string): string {
  const base = (name.split(',')[0] ?? name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\/.*$/, ' ')
    .replace(/[^a-z\s]/g, ' ')
  const words = base.split(/\s+/).filter(w => w.length > 2 && !FOOD_NOISE.has(w) && !/^\d+%?$/.test(w))
  return words[words.length - 1] ?? base.trim()
}

function normaliseFoodName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Detailed, composition-led Pexels query. Takes the meal's foods already
// ordered by significance (the caller sorts by calorie contribution desc);
// uses the top few distinct nouns, then the slot phrase.
export function buildMealImageQuery(mealName: string, foods: readonly MealFoodRef[]): string {
  const token = mealTypeToken(mealName)
  const nouns: string[] = []
  for (const f of foods) {
    const n = foodNoun(f.name)
    if (n && !nouns.includes(n)) nouns.push(n)
    if (nouns.length >= 3) break
  }
  const parts = [...nouns, typePhrase(token)].filter(Boolean)
  return parts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

// STABLE composition fingerprint. Independent of quantity / order /
// sort_order / tracking. Two meals with the same slot token and the same
// SET of food identities produce the same key.
export function mealCompositionKey(mealName: string, foods: readonly MealFoodRef[]): string {
  const token = mealTypeToken(mealName)
  const ids = foods
    .map(f => (f.foodDatabaseId ? `id:${f.foodDatabaseId}` : `name:${normaliseFoodName(f.name)}`))
    .filter(Boolean)
  const uniqueSorted = Array.from(new Set(ids)).sort()
  return `${token}::${uniqueSorted.join(',')}`
}

// The visual-anchor noun the scorer requires in a candidate photo - the
// single biggest food contributor's noun (falls back to the slot token).
export function mealNoun(mealName: string, foods: readonly MealFoodRef[]): string {
  const first = foods[0]
  return first ? foodNoun(first.name) : mealTypeToken(mealName)
}
