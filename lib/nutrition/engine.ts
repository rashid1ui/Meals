// Nutrition Engine - the SINGLE authoritative place that turns a user's
// profile (sex/age/weight/height/activity/goal) into a starting daily
// calorie + macro target. Pure, framework-free (no Supabase, no 'use
// server') - same pattern as calculator.ts/solver.ts/units.ts in this
// directory, so it's usable from both server actions and client components.
//
// This module does NOT touch lib/nutrition/calculator.ts or solver.ts - it
// only produces the same four numbers (calories/protein/carbs/fat) that the
// existing manual-entry onboarding flow already fed into those files. The
// deterministic solver and AI meal generator are unaware this engine exists.
//
// IMPORTANT: all formulas below produce a STARTING ESTIMATE, not a measured
// fact about the user's metabolism. Callers should present
// estimatedMaintenanceCalories as "estimated maintenance" and calories as a
// "recommended starting target" - never as an exact physiological truth.

export type Sex = 'male' | 'female'

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active'

export type Goal = 'cut' | 'recomp' | 'lean_bulk' | 'maintain'

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.20,
  lightly_active: 1.35,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.90
}

// Cut/Lean Bulk multipliers come directly from the spec (0.85 / 1.10).
// Recomp's spec range is 0.95-1.00; 0.975 is the deterministic midpoint,
// chosen so the default stays close to maintenance (per spec) rather than
// drifting toward either the aggressive-cut or true-maintenance edge of the
// range.
export const GOAL_CALORIE_MULTIPLIER: Record<Goal, number> = {
  cut: 0.85,
  recomp: 0.975,
  lean_bulk: 1.10,
  maintain: 1.0
}

export const GOAL_PROTEIN_G_PER_KG: Record<Goal, number> = {
  cut: 2.0,
  recomp: 1.8,
  lean_bulk: 1.8,
  maintain: 1.6
}

export const FAT_DEFAULT_G_PER_KG = 0.8
export const FAT_MIN_G_PER_KG = 0.6

// Signed starting target rate, percent of bodyweight per week. Positive =
// gain, negative = loss. Recomp/Maintain target an approximately stable
// scale weight rather than a directional rate.
export const GOAL_TARGET_WEEKLY_RATE_PERCENT: Record<Goal, number> = {
  cut: -0.5,
  recomp: 0,
  lean_bulk: 0.25,
  maintain: 0
}

// A concerning-target floor: below this, or below the user's own BMR, the
// engine still returns a target (never silently refuses) but attaches a
// warning so the UI can surface it. Not a medical threshold - a conservative
// sanity flag, per the spec's instruction not to silently generate an
// extreme diet.
export const LOW_CALORIE_WARNING_FLOOR = 1200

export interface NutritionProfileInput {
  sex: Sex
  age: number
  weightKg: number
  heightCm: number
  activityLevel: ActivityLevel
  trainingDaysPerWeek: number
  goal: Goal
  // Optional inputs, reserved for future refinement (e.g. lean-body-mass
  // based protein targets). Deliberately unused by the v1 formulas below -
  // see Part 6 of the spec ("do not complicate v1 unnecessarily").
  bodyFatPercent?: number | null
  averageDailySteps?: number | null
  currentCalorieIntake?: number | null
}

export interface NutritionTarget {
  calories: number
  protein: number
  carbs: number
  fat: number
  goal: Goal
  // Rounded TDEE, for display as "estimated maintenance" - never "exact".
  estimatedMaintenanceCalories: number
  // Percent difference between the calorie target and estimated maintenance
  // (e.g. -15 for a 15% cut, +10 for a 10% surplus, 0 for maintain).
  calorieAdjustmentPercent: number
  proteinGramsPerKg: number
  fatGramsPerKg: number
  targetWeeklyRatePercent: number
  calculationVersion: string
  warnings: string[]
}

export const CALCULATION_VERSION = 'v1'

/**
 * Mifflin-St Jeor BMR. Full float precision - callers round only for
 * presentation (Part 3 of the spec).
 */
export function calculateBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activityLevel]
}

/**
 * Fat target in grams. Applies the goal-independent default rate unless a
 * custom rate is supplied, and always enforces the practical minimum so a
 * caller can never end up below FAT_MIN_G_PER_KG regardless of the rate
 * passed in.
 */
export function calculateFatGrams(weightKg: number, gPerKg: number = FAT_DEFAULT_G_PER_KG): number {
  return Math.max(weightKg * gPerKg, weightKg * FAT_MIN_G_PER_KG)
}

/**
 * Carbs receive the remaining calories after protein and fat are accounted
 * for. Clamped to zero - a caller passing in a calorie target too low for
 * the protein+fat minimums gets 0 carbs rather than a negative number; see
 * validateNutritionTarget for surfacing that as an error.
 */
export function calculateCarbsGrams(targetCalories: number, proteinGrams: number, fatGrams: number): number {
  const carbCalories = targetCalories - proteinGrams * 4 - fatGrams * 9
  return Math.max(0, carbCalories / 4)
}

export function lbToKg(lb: number): number {
  return lb * 0.45359237
}

export function kgToLb(kg: number): number {
  return kg / 0.45359237
}

function isFiniteNumber(n: number): boolean {
  return typeof n === 'number' && !Number.isNaN(n) && Number.isFinite(n)
}

/**
 * Builds the single authoritative NutritionTarget for a profile. Rounding
 * happens ONCE, at the very end: calories/protein/fat are rounded first,
 * then carbs is derived from the ROUNDED calorie target and ROUNDED
 * protein/fat so the four displayed numbers reconcile against each other
 * (Part 8) instead of each independently rounding away from the total.
 */
export function buildNutritionTarget(input: NutritionProfileInput): NutritionTarget {
  const { sex, age, weightKg, heightCm, activityLevel, goal } = input

  const bmr = calculateBMR(sex, weightKg, heightCm, age)
  const tdee = calculateTDEE(bmr, activityLevel)

  const calorieMultiplier = GOAL_CALORIE_MULTIPLIER[goal]
  const rawCalorieTarget = tdee * calorieMultiplier

  const proteinGramsPerKg = GOAL_PROTEIN_G_PER_KG[goal]
  const rawProteinGrams = weightKg * proteinGramsPerKg
  const rawFatGrams = calculateFatGrams(weightKg)

  const calories = Math.round(rawCalorieTarget)
  const protein = Math.round(rawProteinGrams)
  const fat = Math.round(rawFatGrams)
  const carbs = Math.round(calculateCarbsGrams(calories, protein, fat))

  const estimatedMaintenanceCalories = Math.round(tdee)
  const calorieAdjustmentPercent = (calorieMultiplier - 1) * 100

  const warnings: string[] = []
  if (calories < bmr || calories < LOW_CALORIE_WARNING_FLOOR) {
    warnings.push(
      'This starting target is unusually low. Consider consulting a healthcare or nutrition professional before starting.'
    )
  }

  return {
    calories,
    protein,
    carbs,
    fat,
    goal,
    estimatedMaintenanceCalories,
    calorieAdjustmentPercent,
    proteinGramsPerKg,
    fatGramsPerKg: FAT_DEFAULT_G_PER_KG,
    targetWeeklyRatePercent: GOAL_TARGET_WEEKLY_RATE_PERCENT[goal],
    calculationVersion: CALCULATION_VERSION,
    warnings
  }
}

// Rounding-only slack between the sum of macro calories and the target
// calorie figure - never a real tolerance on the underlying math, just the
// unavoidable result of protein/carbs/fat each being whole grams.
const MACRO_RECONCILIATION_TOLERANCE_KCAL = 15

export function validateNutritionTarget(target: NutritionTarget): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const values = [target.calories, target.protein, target.carbs, target.fat]
  if (values.some(v => !isFiniteNumber(v))) {
    errors.push('Nutrition target contains a non-finite value (NaN or Infinity).')
    return { valid: false, errors }
  }

  if (target.calories <= 0) errors.push('Calories must be greater than 0.')
  if (target.protein <= 0) errors.push('Protein must be greater than 0.')
  if (target.carbs < 0) errors.push('Carbs cannot be negative.')
  if (target.fat < 0) errors.push('Fat cannot be negative.')

  const macroCalories = target.protein * 4 + target.carbs * 4 + target.fat * 9
  if (Math.abs(macroCalories - target.calories) > MACRO_RECONCILIATION_TOLERANCE_KCAL) {
    errors.push(
      `Macro calories (${macroCalories.toFixed(0)}) do not reconcile with the calorie target (${target.calories}).`
    )
  }

  return { valid: errors.length === 0, errors }
}
