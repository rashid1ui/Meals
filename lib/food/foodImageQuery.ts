// Pure, framework-free query generation for food photography lookups - no
// Supabase, no network, no 'use client'/'use server'.
//
// The app NEVER runs these queries at render time. scripts/assign-food-images.ts
// runs them once against the Pexels API and stores the resulting URL on
// food_database.image_url; FoodRow / FoodPickerModal only ever read that
// stored value.
//
// Algorithm (name is the source of truth):
//   food_database.name
//     -> split "<Base>, <Qual1>, <Qual2>" into base + qualifiers
//     -> drop ONLY nutrition-basis noise ("Dry", "Lowfat 2%", "93/7", ...)
//     -> keep every visually meaningful descriptor (Raw/Cooked/Grilled/
//        Baked/Sliced/Ground/variety/cut/...)
//     -> "<qualifiers> <base>", lowercased, whitespace-normalised
// No attribute is invented that isn't already in the name.

// Tokens that describe how nutrition is measured, not how the food looks -
// stripped from anywhere in the name.
const NOISE_TOKEN = [
  /^dry$/i,
  /^dried$/i, // "Dates, Dried" keeps meaning via base; dried adds nothing visual for most
  /^lowfat$/i,
  /^low$/i,
  /^nonfat$/i,
  /^fat$/i, // only ever appears as part of "low fat" / "nonfat"
  /^reduced$/i,
  /^skim$/i,
  /^part$/i, // "Part Skim"
  /^\d+(?:\.\d+)?%?$/, // "2%", "93", "7", "1.5"
  /^\d+\/\d+$/, // "93/7"
  /^unsalted$/i,
  /^salted$/i,
  /^light$/i, // "Tuna, Light" - not a visual distinction
  /^in$/i,
  /^water$/i, // "Canned in Water"
  /^\/$/ // stray separator in "Flour Tortilla / Wrap"
]

// A handful of names where the literal string is a poor image query: brand
// names with no stock photo, or an alias the search engine trips over. These
// are the ONLY hardcoded queries - everything else is derived from the name.
export const FOOD_IMAGE_QUERY_OVERRIDES: Record<string, string> = {
  'Cerelac': 'baby cereal porridge bowl',
  'Reef High Fiber Bread': 'high fiber whole grain bread loaf',
  'Limitless Whey Protein(us)': 'whey protein powder scoop',
  'Limitless Whey Protein (25g protein/serving)': 'whey protein powder scoop',
  'optimum nutrition Creatine (5g/serving)': 'creatine monohydrate powder',
  'Flour Tortilla / Wrap': 'stack of flour tortillas'
}

// Turns a food_database name into a detailed Pexels query, preserving every
// meaningful descriptor and dropping only nutrition-basis noise. Qualifiers
// (the comma-separated tail) lead, because "cooked chicken breast" reads
// better to an image search than "chicken breast cooked".
export function deriveFoodImageQuery(name: string): string {
  const parts = name.split(',').map(s => s.trim()).filter(Boolean)
  const base = parts[0] ?? name
  // Reversed: catalog names read "Food, Cut, State" ("Beef, Lean, Cooked"),
  // so the last comma-part is the preparation state and should lead the
  // query ("cooked lean beef").
  const qualifiers = parts.slice(1).reverse()

  const tokens = [
    ...qualifiers.flatMap(q => q.split(/\s+/)),
    ...base.split(/\s+/)
  ]
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => !NOISE_TOKEN.some(re => re.test(t)))

  const phrase = tokens.join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
  // Guard: if noise-stripping emptied it (shouldn't happen for real names),
  // fall back to the raw lowercased name so we never search for "".
  return phrase || name.toLowerCase().trim()
}

// The query scripts/assign-food-images.ts sends to Pexels for a given food.
// Prefers a hand-tuned override for the few brand/alias names; otherwise
// derives one straight from the database name.
export function buildFoodImageQuery(name: string): string {
  const trimmed = name.trim()
  return FOOD_IMAGE_QUERY_OVERRIDES[trimmed] ?? deriveFoodImageQuery(trimmed)
}

// The single most identifying word in a food name - the last word of the
// base, before the first comma ("Chicken Breast, Cooked" -> "breast";
// "Brown Rice, Dry" -> "rice"). scripts/assign-food-images.ts requires this
// word to appear in a candidate photo's description before it will accept
// the match, so "black beans" never resolves to a coffee-bean photo.
export function primaryFoodNoun(name: string): string {
  const base = (name.split(',')[0] ?? name)
    .toLowerCase()
    // strip parenthetical/bracketed brand notes and slashed aliases so a
    // name like "Limitless Whey Protein(us)" or "Creatine (5g/serving)"
    // yields "protein" / "creatine", not "protein(us)" / "(5g/serving)".
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\/.*$/, ' ')
    .replace(/[^a-z\s]/g, ' ')
  const words = base.split(/\s+/).filter(w => w.length > 1 && !NOISE_TOKEN.some(re => re.test(w)))
  return words[words.length - 1] ?? base.trim()
}
