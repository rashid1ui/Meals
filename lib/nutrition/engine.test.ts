import test from 'node:test'
import assert from 'node:assert'
import {
  calculateBMR,
  calculateTDEE,
  getActivityMultiplier,
  calculateFatGrams,
  calculateCarbsGrams,
  buildNutritionTarget,
  validateNutritionTarget,
  lbToKg,
  kgToLb,
  ACTIVITY_FACTORS,
  GOAL_CALORIE_MULTIPLIER,
  GOAL_PROTEIN_G_PER_KG,
  FAT_DEFAULT_G_PER_KG,
  FAT_MIN_G_PER_KG,
  LOW_CALORIE_WARNING_FLOOR,
  isValidHeightCm,
  HEIGHT_CM_MIN,
  HEIGHT_CM_MAX,
  isValidWeightKg,
  WEIGHT_KG_MIN,
  WEIGHT_KG_MAX,
  calculateBMI,
  classifyBmiWarning,
  BMI_LOW_WARNING,
  BMI_HIGH_WARNING,
  classifyBodyFatWarning,
  BODY_FAT_PERCENT_LOW_WARNING,
  BODY_FAT_PERCENT_HIGH_WARNING,
  type Goal,
  type ActivityLevel,
  type NutritionProfileInput
} from './engine'

// ---------------------------------------------------------------------------
// BMR (Mifflin-St Jeor)
// ---------------------------------------------------------------------------

test('calculateBMR - male', () => {
  // 10*75 + 6.25*175 - 5*28 + 5
  const bmr = calculateBMR('male', 75, 175, 28)
  assert.strictEqual(bmr, 1708.75)
})

test('calculateBMR - female', () => {
  // 10*60 + 6.25*165 - 5*30 - 161
  const bmr = calculateBMR('female', 60, 165, 30)
  assert.strictEqual(bmr, 1320.25)
})

// ---------------------------------------------------------------------------
// TDEE - every activity level
// ---------------------------------------------------------------------------

test('calculateTDEE - every activity level', () => {
  const bmr = 1700
  for (const level of Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]) {
    const tdee = calculateTDEE(bmr, level)
    assert.strictEqual(tdee, bmr * ACTIVITY_FACTORS[level])
  }
  assert.strictEqual(calculateTDEE(bmr, 'sedentary'), 1700 * 1.20)
  assert.strictEqual(calculateTDEE(bmr, 'lightly_active'), 1700 * 1.35)
  assert.strictEqual(calculateTDEE(bmr, 'moderately_active'), 1700 * 1.55)
  assert.strictEqual(calculateTDEE(bmr, 'very_active'), 1700 * 1.725)
  assert.strictEqual(calculateTDEE(bmr, 'extremely_active'), 1700 * 1.90)
})

// ---------------------------------------------------------------------------
// getActivityMultiplier - Jeff Nippard's published table + interpolation
// ---------------------------------------------------------------------------

// Only the 3-day/6-day columns are Jeff's actual published endpoints; 4/5
// days are this app's own linear interpolation (see engine.ts). Mirrors the
// table in the plan exactly.
const JEFF_TABLE: Record<'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active', [number, number, number, number]> = {
  sedentary: [1.20, 1.30, 1.40, 1.50],
  lightly_active: [1.50, 1.60, 1.70, 1.80],
  moderately_active: [1.80, 1.8667, 1.9333, 2.00],
  very_active: [2.00, 2.0667, 2.1333, 2.20]
}

test('getActivityMultiplier - 0/1/2 training days always equal the activity-level baseline', () => {
  for (const level of Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]) {
    for (const days of [0, 1, 2]) {
      assert.strictEqual(getActivityMultiplier(level, days), ACTIVITY_FACTORS[level], `level=${level} days=${days}`)
    }
  }
})

test('getActivityMultiplier - 3/4/5/6 training days match Jeff\'s table (interpolated for 4/5)', () => {
  for (const level of Object.keys(JEFF_TABLE) as (keyof typeof JEFF_TABLE)[]) {
    const [d3, d4, d5, d6] = JEFF_TABLE[level]
    assert.ok(Math.abs(getActivityMultiplier(level, 3) - d3) < 1e-6, `level=${level} days=3`)
    assert.ok(Math.abs(getActivityMultiplier(level, 4) - d4) < 1e-3, `level=${level} days=4`)
    assert.ok(Math.abs(getActivityMultiplier(level, 5) - d5) < 1e-3, `level=${level} days=5`)
    assert.ok(Math.abs(getActivityMultiplier(level, 6) - d6) < 1e-6, `level=${level} days=6`)
  }
})

test('getActivityMultiplier - 7 training days is capped at the 6-day value', () => {
  for (const level of Object.keys(JEFF_TABLE) as (keyof typeof JEFF_TABLE)[]) {
    assert.strictEqual(getActivityMultiplier(level, 7), getActivityMultiplier(level, 6), `level=${level}`)
  }
})

test('getActivityMultiplier - extremely_active always equals its baseline regardless of training days', () => {
  for (let days = 0; days <= 7; days++) {
    assert.strictEqual(getActivityMultiplier('extremely_active', days), ACTIVITY_FACTORS.extremely_active, `days=${days}`)
  }
})

test('getActivityMultiplier - worked example: moderately_active + 4 days = 1.8667', () => {
  assert.ok(Math.abs(getActivityMultiplier('moderately_active', 4) - 1.8667) < 1e-3)
})

// ---------------------------------------------------------------------------
// Goals - calorie multipliers
// ---------------------------------------------------------------------------

function baseProfile(overrides: Partial<NutritionProfileInput> = {}): NutritionProfileInput {
  return {
    sex: 'male',
    age: 28,
    weightKg: 75,
    heightCm: 175,
    activityLevel: 'moderately_active',
    trainingDaysPerWeek: 4,
    goal: 'maintain',
    ...overrides
  }
}

test('goals - cut/recomp/lean_bulk/maintain calorie targets scale off TDEE', () => {
  // baseProfile() trains 4 days/week, so the comparison TDEE must use the
  // same trainingDaysPerWeek to match buildNutritionTarget's own calculation.
  const tdee = calculateTDEE(calculateBMR('male', 75, 175, 28), 'moderately_active', 4)
  for (const goal of Object.keys(GOAL_CALORIE_MULTIPLIER) as Goal[]) {
    const target = buildNutritionTarget(baseProfile({ goal }))
    const expected = Math.round(tdee * GOAL_CALORIE_MULTIPLIER[goal])
    assert.strictEqual(target.calories, expected, `goal=${goal}`)
    assert.strictEqual(target.estimatedMaintenanceCalories, Math.round(tdee))
  }
})

test('goal calorie multipliers match spec', () => {
  assert.strictEqual(GOAL_CALORIE_MULTIPLIER.cut, 0.85)
  assert.strictEqual(GOAL_CALORIE_MULTIPLIER.lean_bulk, 1.10)
  assert.strictEqual(GOAL_CALORIE_MULTIPLIER.maintain, 1.0)
  // Recomp: deterministic midpoint of the spec's 0.95-1.00 range.
  assert.strictEqual(GOAL_CALORIE_MULTIPLIER.recomp, 0.975)
  assert.ok(GOAL_CALORIE_MULTIPLIER.recomp >= 0.95 && GOAL_CALORIE_MULTIPLIER.recomp <= 1.00)
})

// ---------------------------------------------------------------------------
// Protein - g/kg by goal
// ---------------------------------------------------------------------------

test('protein - 75kg at each goal', () => {
  assert.strictEqual(buildNutritionTarget(baseProfile({ goal: 'cut', weightKg: 75 })).protein, 150)
  assert.strictEqual(buildNutritionTarget(baseProfile({ goal: 'lean_bulk', weightKg: 75 })).protein, 135)
  assert.strictEqual(buildNutritionTarget(baseProfile({ goal: 'maintain', weightKg: 75 })).protein, 120)
  assert.strictEqual(buildNutritionTarget(baseProfile({ goal: 'recomp', weightKg: 75 })).protein, 135)
})

test('protein g/kg constants match spec (never lb)', () => {
  assert.strictEqual(GOAL_PROTEIN_G_PER_KG.cut, 2.0)
  assert.strictEqual(GOAL_PROTEIN_G_PER_KG.recomp, 1.8)
  assert.strictEqual(GOAL_PROTEIN_G_PER_KG.lean_bulk, 1.8)
  assert.strictEqual(GOAL_PROTEIN_G_PER_KG.maintain, 1.6)
})

// ---------------------------------------------------------------------------
// Fat - default and minimum
// ---------------------------------------------------------------------------

test('fat - 75kg default is 60g', () => {
  assert.strictEqual(calculateFatGrams(75), 60)
  assert.strictEqual(FAT_DEFAULT_G_PER_KG, 0.8)
})

test('fat - a below-minimum custom rate is clamped up to the 0.6g/kg floor', () => {
  // 0.3 g/kg would be 22.5g at 75kg; the floor (0.6 g/kg = 45g) wins.
  assert.strictEqual(calculateFatGrams(75, 0.3), 45)
  assert.strictEqual(FAT_MIN_G_PER_KG, 0.6)
})

// ---------------------------------------------------------------------------
// Carbs - remaining calories, reconciliation with target
// ---------------------------------------------------------------------------

test('carbs - protein + fat + carb calories approximately equal the target', () => {
  for (const goal of ['cut', 'recomp', 'lean_bulk', 'maintain'] as Goal[]) {
    const target = buildNutritionTarget(baseProfile({ goal }))
    const macroCalories = target.protein * 4 + target.carbs * 4 + target.fat * 9
    assert.ok(
      Math.abs(macroCalories - target.calories) <= 5,
      `goal=${goal} macroCalories=${macroCalories} target=${target.calories}`
    )
  }
})

test('calculateCarbsGrams clamps to zero rather than going negative', () => {
  // Protein+fat alone already exceed the (absurdly low) target.
  assert.strictEqual(calculateCarbsGrams(100, 100, 50), 0)
})

// ---------------------------------------------------------------------------
// Part 18 worked example - reproduced from formulas, not hardcoded
// ---------------------------------------------------------------------------

test('Part 18 worked example: male/28/75kg/175cm/moderately_active/4 training days/cut', () => {
  const target = buildNutritionTarget(
    baseProfile({
      sex: 'male',
      age: 28,
      weightKg: 75,
      heightCm: 175,
      activityLevel: 'moderately_active',
      trainingDaysPerWeek: 4,
      goal: 'cut'
    })
  )
  // BMR 1708.75 * getActivityMultiplier('moderately_active', 4)=1.8667 ->
  // ~3190 estimated maintenance, ~2711 cut target, 150g protein, 60g fat, ~393g carbs.
  assert.ok(Math.abs(target.estimatedMaintenanceCalories - 3190) <= 10)
  assert.ok(Math.abs(target.calories - 2711) <= 10)
  assert.strictEqual(target.protein, 150)
  assert.strictEqual(target.fat, 60)
  assert.ok(Math.abs(target.carbs - 393) <= 5)
})

// ---------------------------------------------------------------------------
// Sanity checks / validation (Part 9)
// ---------------------------------------------------------------------------

test('validateNutritionTarget - accepts a normal target', () => {
  const target = buildNutritionTarget(baseProfile())
  const { valid, errors } = validateNutritionTarget(target)
  assert.strictEqual(valid, true, errors.join(', '))
})

test('validateNutritionTarget - rejects non-finite values', () => {
  const target = buildNutritionTarget(baseProfile())
  const { valid, errors } = validateNutritionTarget({ ...target, calories: NaN })
  assert.strictEqual(valid, false)
  assert.ok(errors.length > 0)
})

test('validateNutritionTarget - rejects zero/negative calories and protein', () => {
  const target = buildNutritionTarget(baseProfile())
  assert.strictEqual(validateNutritionTarget({ ...target, calories: 0 }).valid, false)
  assert.strictEqual(validateNutritionTarget({ ...target, protein: -5 }).valid, false)
  assert.strictEqual(validateNutritionTarget({ ...target, carbs: -1 }).valid, false)
  assert.strictEqual(validateNutritionTarget({ ...target, fat: -1 }).valid, false)
})

test('validateNutritionTarget - rejects macro calories that do not reconcile with target', () => {
  const target = buildNutritionTarget(baseProfile())
  const broken = { ...target, carbs: target.carbs + 500 }
  assert.strictEqual(validateNutritionTarget(broken).valid, false)
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('edge case - missing optional fields does not affect the calculation', () => {
  const withOptionals = buildNutritionTarget(
    baseProfile({ bodyFatPercent: 18, averageDailySteps: 8000, currentCalorieIntake: 2400 })
  )
  const withoutOptionals = buildNutritionTarget(baseProfile())
  assert.deepStrictEqual(withOptionals, withoutOptionals)
})

test('edge case - very low bodyweight still produces a finite, valid target', () => {
  const target = buildNutritionTarget(baseProfile({ weightKg: 40, goal: 'cut' }))
  assert.strictEqual(validateNutritionTarget(target).valid, true)
})

test('edge case - very high bodyweight still produces a finite, valid target', () => {
  const target = buildNutritionTarget(baseProfile({ weightKg: 180, goal: 'lean_bulk' }))
  assert.strictEqual(validateNutritionTarget(target).valid, true)
})

test('edge case - an unusually low calorie target surfaces a warning, not a crash', () => {
  // Small, sedentary, older female on an aggressive cut lands near/below the floor.
  const target = buildNutritionTarget(
    baseProfile({ sex: 'female', age: 55, weightKg: 45, heightCm: 150, activityLevel: 'sedentary', goal: 'cut' })
  )
  assert.ok(target.calories < LOW_CALORIE_WARNING_FLOOR + 50)
  assert.ok(target.warnings.length > 0)
})

test('edge case - decimal bodyweight is handled without special-casing', () => {
  const target = buildNutritionTarget(baseProfile({ weightKg: 74.6 }))
  assert.strictEqual(validateNutritionTarget(target).valid, true)
})

test('edge case - kg/lb conversion round-trips', () => {
  const kg = 82.5
  const lb = kgToLb(kg)
  assert.ok(Math.abs(lbToKg(lb) - kg) < 1e-9)
  // 1 lb ~= 0.453592 kg
  assert.ok(Math.abs(lbToKg(1) - 0.45359237) < 1e-9)
})

test('purity - same input always produces the same output (no hidden state)', () => {
  const input = baseProfile({ goal: 'lean_bulk' })
  const a = buildNutritionTarget(input)
  const b = buildNutritionTarget(input)
  assert.deepStrictEqual(a, b)
})

test('manual override is a UI-state concern, not an engine concern - the engine never mutates input', () => {
  const input = baseProfile()
  const snapshot = JSON.parse(JSON.stringify(input))
  buildNutritionTarget(input)
  assert.deepStrictEqual(input, snapshot)
})

// ---------------------------------------------------------------------------
// Height validation - guards against a 1-2 digit entry (e.g. "75" instead
// of "175") silently corrupting BMR/TDEE/calorie/macro output.
// ---------------------------------------------------------------------------

test('isValidHeightCm - accepts normal 3-digit metric heights', () => {
  assert.strictEqual(isValidHeightCm(160), true)
  assert.strictEqual(isValidHeightCm(175), true)
  assert.strictEqual(isValidHeightCm(183), true)
  assert.strictEqual(isValidHeightCm(195), true)
})

test('isValidHeightCm - rejects short/garbage/out-of-range values', () => {
  assert.strictEqual(isValidHeightCm(7), false)
  assert.strictEqual(isValidHeightCm(75), false)
  assert.strictEqual(isValidHeightCm(99), false)
  assert.strictEqual(isValidHeightCm(251), false)
  assert.strictEqual(isValidHeightCm(1000), false)
  assert.strictEqual(isValidHeightCm(1200), false)
})

test('isValidHeightCm - boundary values are inclusive', () => {
  assert.strictEqual(isValidHeightCm(HEIGHT_CM_MIN), true)
  assert.strictEqual(isValidHeightCm(HEIGHT_CM_MAX), true)
  assert.strictEqual(isValidHeightCm(HEIGHT_CM_MIN - 1), false)
  assert.strictEqual(isValidHeightCm(HEIGHT_CM_MAX + 1), false)
  assert.strictEqual(HEIGHT_CM_MIN, 100)
  assert.strictEqual(HEIGHT_CM_MAX, 250)
})

test('isValidHeightCm - rejects non-integers, NaN, empty/non-numeric parses, and negatives', () => {
  assert.strictEqual(isValidHeightCm(175.5), false)
  assert.strictEqual(isValidHeightCm(Number('')), false) // empty input -> 0
  assert.strictEqual(isValidHeightCm(Number('abc')), false) // non-numeric input -> NaN
  assert.strictEqual(isValidHeightCm(Number('75cm')), false) // trailing junk -> NaN
  assert.strictEqual(isValidHeightCm(-175), false)
  assert.strictEqual(isValidHeightCm(0), false)
})

// ---------------------------------------------------------------------------
// Weight validation - previously unbounded (`> 0` only); guards against a
// stray "5" or "500" kg entry silently corrupting every downstream number.
// ---------------------------------------------------------------------------

test('isValidWeightKg - accepts normal weights', () => {
  assert.strictEqual(isValidWeightKg(47), true)
  assert.strictEqual(isValidWeightKg(75), true)
  assert.strictEqual(isValidWeightKg(180), true)
})

test('isValidWeightKg - boundary values are inclusive, out-of-range is rejected', () => {
  assert.strictEqual(isValidWeightKg(WEIGHT_KG_MIN), true)
  assert.strictEqual(isValidWeightKg(WEIGHT_KG_MAX), true)
  assert.strictEqual(isValidWeightKg(WEIGHT_KG_MIN - 1), false)
  assert.strictEqual(isValidWeightKg(WEIGHT_KG_MAX + 1), false)
  assert.strictEqual(isValidWeightKg(5), false)
  assert.strictEqual(isValidWeightKg(500), false)
})

test('isValidWeightKg - rejects non-finite values', () => {
  assert.strictEqual(isValidWeightKg(NaN), false)
  assert.strictEqual(isValidWeightKg(Infinity), false)
})

// ---------------------------------------------------------------------------
// BMI / body-fat soft warnings - live, informational only (never blocking on
// their own; ProfileStep gates Continue on acknowledgment, not on these
// returning null).
// ---------------------------------------------------------------------------

test('calculateBMI - standard formula', () => {
  // 75kg / (1.75m)^2 = 24.489...
  assert.ok(Math.abs(calculateBMI(75, 175) - 24.49) < 0.01)
})

test('classifyBmiWarning - the 47kg/175cm example triggers the low-BMI warning', () => {
  const bmi = calculateBMI(47, 175)
  assert.ok(bmi < BMI_LOW_WARNING) // ~15.3
  const warning = classifyBmiWarning(47, 175)
  assert.ok(warning !== null)
  assert.ok(warning!.toLowerCase().includes('double-check'))
})

test('classifyBmiWarning - a normal BMI produces no warning', () => {
  assert.strictEqual(classifyBmiWarning(75, 175), null)
})

test('classifyBmiWarning - an unusually high BMI triggers a warning', () => {
  assert.ok(calculateBMI(140, 175) > BMI_HIGH_WARNING)
  assert.ok(classifyBmiWarning(140, 175) !== null)
})

test('classifyBodyFatWarning - within range produces no warning', () => {
  assert.strictEqual(classifyBodyFatWarning(18), null)
  assert.strictEqual(classifyBodyFatWarning(BODY_FAT_PERCENT_LOW_WARNING), null)
  assert.strictEqual(classifyBodyFatWarning(BODY_FAT_PERCENT_HIGH_WARNING), null)
})

test('classifyBodyFatWarning - outside [3,60] triggers a warning', () => {
  assert.ok(classifyBodyFatWarning(BODY_FAT_PERCENT_LOW_WARNING - 1) !== null)
  assert.ok(classifyBodyFatWarning(BODY_FAT_PERCENT_HIGH_WARNING + 1) !== null)
})
