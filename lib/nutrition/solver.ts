import {
  CALORIE_TOLERANCE,
  PROTEIN_TOLERANCE_PERCENT,
  PROTEIN_TOLERANCE_MIN_GRAMS,
  CARBS_TOLERANCE_PERCENT,
  CARBS_TOLERANCE_MIN_GRAMS,
  FAT_TOLERANCE_PERCENT,
  FAT_TOLERANCE_MIN_GRAMS,
  type FoodMacro
} from './calculator'

export const MIN_QUANTITY = 10
export const MAX_QUANTITY = 1000

export interface SolverResult {
  feasible: boolean
  quantities: Record<string, number> // Maps food_id to total grams
  calculated: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  absoluteErrors: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  percentageErrors: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  reason?: string
}

function macroTolerance(target: number, percent: number, minGrams: number): number {
  return Math.max(minGrams, target * percent)
}

function calculateTolerances(targetKcal: number, targetP: number, targetC: number, targetF: number) {
  return {
    calories: targetKcal * CALORIE_TOLERANCE,
    protein: macroTolerance(targetP, PROTEIN_TOLERANCE_PERCENT, PROTEIN_TOLERANCE_MIN_GRAMS),
    carbs: macroTolerance(targetC, CARBS_TOLERANCE_PERCENT, CARBS_TOLERANCE_MIN_GRAMS),
    fat: macroTolerance(targetF, FAT_TOLERANCE_PERCENT, FAT_TOLERANCE_MIN_GRAMS)
  }
}

function isValid(
  totals: { calories: number; protein: number; carbs: number; fat: number },
  targets: { calories: number; protein: number; carbs: number; fat: number },
  tolerances: { calories: number; protein: number; carbs: number; fat: number }
): boolean {
  if (Math.abs(totals.calories - targets.calories) > tolerances.calories) return false
  if (Math.abs(totals.protein - targets.protein) > tolerances.protein) return false
  if (Math.abs(totals.carbs - targets.carbs) > tolerances.carbs) return false
  if (Math.abs(totals.fat - targets.fat) > tolerances.fat) return false
  return true
}

function computeTotals(quantities: number[], densities: { calories: number; protein: number; carbs: number; fat: number }[]) {
  let c = 0, p = 0, cb = 0, f = 0
  for (let i = 0; i < quantities.length; i++) {
    const q = quantities[i]
    c += densities[i].calories * q
    p += densities[i].protein * q
    cb += densities[i].carbs * q
    f += densities[i].fat * q
  }
  return { calories: c, protein: p, carbs: cb, fat: f }
}

function getDominantErrorReason(
  totals: { calories: number; protein: number; carbs: number; fat: number },
  targets: { calories: number; protein: number; carbs: number; fat: number },
  tolerances: { calories: number; protein: number; carbs: number; fat: number }
): string {
  const errs = [
    { name: 'Calories', diff: totals.calories - targets.calories, tol: tolerances.calories },
    { name: 'Protein', diff: totals.protein - targets.protein, tol: tolerances.protein },
    { name: 'Carbs', diff: totals.carbs - targets.carbs, tol: tolerances.carbs },
    { name: 'Fat', diff: totals.fat - targets.fat, tol: tolerances.fat }
  ]

  let maxRatio = -1
  let worst = errs[0]
  for (const e of errs) {
    const ratio = Math.abs(e.diff) / e.tol
    if (ratio > maxRatio) {
      maxRatio = ratio
      worst = e
    }
  }

  const direction = worst.diff > 0 ? 'high' : 'low'
  const action = worst.diff > 0 ? `reduce ${worst.name.toLowerCase()} sources` : `add a higher-${worst.name.toLowerCase()} food`
  return `Your selected foods are too ${direction} in ${worst.name} to reach the targets within allowed portions. Try to ${action}.`
}

export function solveDietQuantities(
  foods: FoodMacro[],
  targetKcal: number,
  targetP: number,
  targetC: number,
  targetF: number
): SolverResult {
  // If no foods, inherently infeasible
  if (foods.length === 0) {
    return {
      feasible: false,
      quantities: {},
      calculated: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      absoluteErrors: { calories: targetKcal, protein: targetP, carbs: targetC, fat: targetF },
      percentageErrors: { calories: 100, protein: 100, carbs: 100, fat: 100 },
      reason: 'No foods selected.'
    }
  }

  const targets = { calories: targetKcal, protein: targetP, carbs: targetC, fat: targetF }
  const tolerances = calculateTolerances(targetKcal, targetP, targetC, targetF)

  // Densities per 1 gram
  const densities = foods.map(f => ({
    calories: f.calories / f.serving_size,
    protein: f.protein / f.serving_size,
    carbs: f.carbs / f.serving_size,
    fat: f.fat / f.serving_size
  }))

  const wC = 1 / Math.pow(tolerances.calories, 2)
  const wP = 1 / Math.pow(tolerances.protein, 2)
  const wCb = 1 / Math.pow(tolerances.carbs, 2)
  const wF = 1 / Math.pow(tolerances.fat, 2)

  // Initialize quantities roughly uniformly based on calories
  const avgCalDensity = densities.reduce((s, d) => s + d.calories, 0) / densities.length
  const initialQty = Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, (targetKcal / (avgCalDensity * foods.length)) || 100))
  const x = foods.map(() => initialQty)

  const maxIter = 200

  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0
    for (let j = 0; j < x.length; j++) {
      let sumC_cal = -targets.calories
      let sumC_pro = -targets.protein
      let sumC_carb = -targets.carbs
      let sumC_fat = -targets.fat

      for (let i = 0; i < x.length; i++) {
        if (i === j) continue
        sumC_cal += densities[i].calories * x[i]
        sumC_pro += densities[i].protein * x[i]
        sumC_carb += densities[i].carbs * x[i]
        sumC_fat += densities[i].fat * x[i]
      }

      const dj = densities[j]
      const num = -(
        wC * dj.calories * sumC_cal +
        wP * dj.protein * sumC_pro +
        wCb * dj.carbs * sumC_carb +
        wF * dj.fat * sumC_fat
      )
      
      const den = (
        wC * Math.pow(dj.calories, 2) +
        wP * Math.pow(dj.protein, 2) +
        wCb * Math.pow(dj.carbs, 2) +
        wF * Math.pow(dj.fat, 2)
      )

      let newX = den === 0 ? MIN_QUANTITY : num / den
      newX = Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, newX))

      const change = Math.abs(x[j] - newX)
      if (change > maxChange) maxChange = change
      
      x[j] = newX
    }

    if (maxChange < 0.1) {
      break
    }
  }

  // Round to nearest whole gram
  let intX = x.map(val => Math.round(val))
  let totals = computeTotals(intX, densities)

  // Deterministic local adjustment if rounding breaks tolerance
  if (!isValid(totals, targets, tolerances)) {
    let improved = true
    const calculateError = (testTotals: { calories: number, protein: number, carbs: number, fat: number }) => {
      return (
        wC * Math.pow(testTotals.calories - targets.calories, 2) +
        wP * Math.pow(testTotals.protein - targets.protein, 2) +
        wCb * Math.pow(testTotals.carbs - targets.carbs, 2) +
        wF * Math.pow(testTotals.fat - targets.fat, 2)
      )
    }

    let currentError = calculateError(totals)

    while (improved && !isValid(totals, targets, tolerances)) {
      improved = false
      let bestX = [...intX]
      let bestError = currentError
      let bestTotals = totals

      for (let j = 0; j < intX.length; j++) {
        for (const step of [-1, 1]) {
          const testVal = intX[j] + step
          if (testVal >= MIN_QUANTITY && testVal <= MAX_QUANTITY) {
            const testX = [...intX]
            testX[j] = testVal
            const testTotals = computeTotals(testX, densities)
            const err = calculateError(testTotals)
            if (err < bestError) {
              bestError = err
              bestX = testX
              bestTotals = testTotals
              improved = true
            }
          }
        }
      }

      if (improved) {
        intX = bestX
        totals = bestTotals
        currentError = bestError
      }
    }
  }

  const feasible = isValid(totals, targets, tolerances)
  const quantities: Record<string, number> = {}
  for (let i = 0; i < foods.length; i++) {
    quantities[foods[i].id] = intX[i]
  }

  return {
    feasible,
    quantities,
    calculated: totals,
    absoluteErrors: {
      calories: Math.abs(totals.calories - targets.calories),
      protein: Math.abs(totals.protein - targets.protein),
      carbs: Math.abs(totals.carbs - targets.carbs),
      fat: Math.abs(totals.fat - targets.fat)
    },
    percentageErrors: {
      calories: targets.calories > 0 ? (Math.abs(totals.calories - targets.calories) / targets.calories) * 100 : 0,
      protein: targets.protein > 0 ? (Math.abs(totals.protein - targets.protein) / targets.protein) * 100 : 0,
      carbs: targets.carbs > 0 ? (Math.abs(totals.carbs - targets.carbs) / targets.carbs) * 100 : 0,
      fat: targets.fat > 0 ? (Math.abs(totals.fat - targets.fat) / targets.fat) * 100 : 0
    },
    reason: feasible ? undefined : getDominantErrorReason(totals, targets, tolerances)
  }
}
