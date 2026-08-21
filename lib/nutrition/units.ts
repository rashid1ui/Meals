// Pure display-unit <-> canonical-gram conversion. No Supabase, no 'use
// server'. This is the ONLY place display units (piece, slice, serving, kg,
// ml, g) convert to/from the canonical grams that
// lib/nutrition/calculator.ts and lib/nutrition/solver.ts operate on -
// neither of those files is touched by this module or by this feature.
//
// displayQuantity x gramsPerDisplayUnit = canonicalGrams

export type DisplayUnit = 'g' | 'kg' | 'ml' | 'piece' | 'slice' | 'serving'

export const DISPLAY_UNIT_OPTIONS: { value: DisplayUnit; label: string }[] = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'ml', label: 'Milliliters (ml)' },
  { value: 'piece', label: 'Piece' },
  { value: 'slice', label: 'Slice' },
  { value: 'serving', label: 'Serving' }
]

export const MAX_GRAMS_PER_DISPLAY_UNIT = 2000

const PIECE_LIKE = new Set<string>(['piece', 'slice', 'serving'])

// Units whose per-unit weight the user must define explicitly at
// food-creation time - there is no universal "1 piece = Xg" the app can
// assume without inventing a conversion.
export function requiresGramsPerUnit(unit: string): boolean {
  return PIECE_LIKE.has(unit)
}

// A fixed, exact unit conversion (never a nutrition assumption): kg is
// always 1000g; plain g/ml need no conversion (1 display unit = 1 canonical
// gram/ml, matching the existing per-100g/100ml convention exactly). Returns
// null for piece/slice/serving, whose weight must come from the food's own
// configured gramsPerDisplayUnit.
export function fixedGramsPerUnit(unit: string): number | null {
  if (unit === 'kg') return 1000
  if (unit === 'g' || unit === 'ml') return 1
  return null
}

export function isValidGramsPerUnit(value: number): boolean {
  return typeof value === 'number' && isFinite(value) && value > 0 && value <= MAX_GRAMS_PER_DISPLAY_UNIT
}

export interface UnitConfig {
  displayUnit: string
  gramsPerDisplayUnit: number
}

export function toCanonicalGrams(displayQuantity: number, config: UnitConfig): number {
  return displayQuantity * config.gramsPerDisplayUnit
}

// Rounds for display only - never mutates the stored canonical grams.
// Piece-like units round to whole numbers ("2.86 eggs" isn't meaningful);
// weight/volume units keep 2 decimals.
export function toDisplayQuantity(canonicalGrams: number, config: UnitConfig): number {
  const raw = canonicalGrams / config.gramsPerDisplayUnit
  return PIECE_LIKE.has(config.displayUnit) ? Math.round(raw) : Math.round(raw * 100) / 100
}

// True when canonicalGrams converts back to a whole number of display
// units (within a small epsilon) - i.e. the solver's output can be shown as
// "3 eggs" exactly rather than an approximation. When false, callers must
// show the rounded value visibly as approximate rather than presenting a
// rounded number as exact.
export function isWholeDisplayQuantity(canonicalGrams: number, config: UnitConfig, epsilon = 0.05): boolean {
  const raw = canonicalGrams / config.gramsPerDisplayUnit
  return Math.abs(raw - Math.round(raw)) <= epsilon
}

export function unitLabel(unit: string, quantity: number): string {
  switch (unit) {
    case 'g':
      return 'g'
    case 'kg':
      return 'kg'
    case 'ml':
      return 'ml'
    case 'piece':
      return quantity === 1 ? 'pc' : 'pcs'
    case 'slice':
      return quantity === 1 ? 'slice' : 'slices'
    case 'serving':
      return quantity === 1 ? 'serving' : 'servings'
    default:
      return unit
  }
}

// Determines the canonical serving_unit a new food_database row should use,
// from the display unit the creator chose. 'ml' maps directly onto the
// existing 'ml' canonical convention (no density guessing); every other
// display unit (including kg/piece/slice/serving) maps to 'grams', since
// grams_per_display_unit already handles the piece<->gram conversion - the
// canonical basis stays exactly the two units calculateFoodMacros/
// solveDietQuantities already support.
export function canonicalServingUnitFor(displayUnit: string): 'grams' | 'ml' {
  return displayUnit === 'ml' ? 'ml' : 'grams'
}
