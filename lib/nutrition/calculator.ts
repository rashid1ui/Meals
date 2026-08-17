export const CALORIE_TOLERANCE = 0.05

// Protein/carbs/fat tolerances scale with the user's target instead of using a
// single fixed gram value, so a 300g protein target isn't held to the same
// absolute margin as a 60g target. Each tolerance is the larger of:
//   - a percentage of the target (bigger targets get proportionally more room), or
//   - a minimum gram floor (small targets never get an unreasonably tiny margin)
// 10% is intentionally looser than the 5% calorie tolerance because macros are
// hit via discrete, whole-gram food quantities and are inherently coarser-grained
// than total calories. The floors match the previous fixed tolerances, so small
// targets are never worse off than before this change.
export const PROTEIN_TOLERANCE_PERCENT = 0.10
export const PROTEIN_TOLERANCE_MIN_GRAMS = 5

export const CARBS_TOLERANCE_PERCENT = 0.10
export const CARBS_TOLERANCE_MIN_GRAMS = 10

export const FAT_TOLERANCE_PERCENT = 0.10
export const FAT_TOLERANCE_MIN_GRAMS = 5

function macroTolerance(target: number, percent: number, minGrams: number): number {
  return Math.max(minGrams, target * percent)
}

export interface FoodMacro {
  id: string
  name: string
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface CalculatedFood {
  food_id: string
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface CalculatedMeal {
  name: string
  sort_order: number
  foods: CalculatedFood[]
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface CalculatedDiet {
  name: string
  meals: CalculatedMeal[]
  daily_calories: number
  daily_protein: number
  daily_carbs: number
  daily_fat: number
}

export function isValidQuantity(quantity: number, unit: string): boolean {
  if (typeof quantity !== 'number' || isNaN(quantity) || !isFinite(quantity) || quantity <= 0) {
    return false
  }
  const u = unit.toLowerCase()
  if (u === 'grams' || u === 'ml') return quantity <= 1000
  if (u === 'pieces' || u === 'piece') return quantity <= 10
  if (u === 'tbsp' || u === 'tablespoon') return quantity <= 10
  if (u === 'tsp' || u === 'teaspoon') return quantity <= 20
  if (u === 'scoop' || u === 'scoops') return quantity <= 5
  return quantity <= 1000
}

export function calculateFoodMacros(quantity: number, dbFood: FoodMacro): CalculatedFood {
  const multiplier = quantity / dbFood.serving_size
  return {
    food_id: dbFood.id,
    name: dbFood.name,
    quantity,
    unit: dbFood.serving_unit,
    calories: dbFood.calories * multiplier,
    protein: dbFood.protein * multiplier,
    carbs: dbFood.carbs * multiplier,
    fat: dbFood.fat * multiplier
  }
}

export function calculateDiet(dietName: string, parsedMeals: any[], dbFoods: FoodMacro[]): { diet?: CalculatedDiet, error?: string } {
  let daily_calories = 0
  let daily_protein = 0
  let daily_carbs = 0
  let daily_fat = 0

  const meals: CalculatedMeal[] = []

  for (let mIdx = 0; mIdx < parsedMeals.length; mIdx++) {
    const meal = parsedMeals[mIdx]
    let meal_calories = 0
    let meal_protein = 0
    let meal_carbs = 0
    let meal_fat = 0
    
    const foods: CalculatedFood[] = []

    for (const item of meal.foods || []) {
      const dbFood = dbFoods.find(f => f.id === item.food_id)
      if (!dbFood) {
        return { error: `Used an invalid food_id: ${item.food_id}` }
      }
      if (!isValidQuantity(item.quantity, dbFood.serving_unit)) {
        return { error: `Invalid or absurd quantity (${item.quantity}) for unit (${dbFood.serving_unit}) for food ${dbFood.name}.` }
      }

      const calculated = calculateFoodMacros(item.quantity, dbFood)
      foods.push(calculated)

      meal_calories += calculated.calories
      meal_protein += calculated.protein
      meal_carbs += calculated.carbs
      meal_fat += calculated.fat
    }

    meals.push({
      name: meal.name || `Meal ${mIdx + 1}`,
      sort_order: mIdx,
      foods,
      calories: meal_calories,
      protein: meal_protein,
      carbs: meal_carbs,
      fat: meal_fat
    })

    daily_calories += meal_calories
    daily_protein += meal_protein
    daily_carbs += meal_carbs
    daily_fat += meal_fat
  }

  return {
    diet: {
      name: dietName,
      meals,
      daily_calories,
      daily_protein,
      daily_carbs,
      daily_fat
    }
  }
}

export function validateMacros(diet: CalculatedDiet, targetKcal: number, targetP: number, targetC: number, targetF: number): { valid: boolean, errors: string[] } {
  const errors: string[] = []
  
  const calDiff = Math.abs(diet.daily_calories - targetKcal)
  if (calDiff > (targetKcal * CALORIE_TOLERANCE)) {
    const direction = diet.daily_calories > targetKcal ? 'above' : 'below'
    const pct = ((calDiff / targetKcal) * 100).toFixed(1)
    errors.push(`Calories are ${pct}% ${direction} target (Target: ${targetKcal}, Actual: ${diet.daily_calories.toFixed(0)})`)
  }
  
  const pTolerance = macroTolerance(targetP, PROTEIN_TOLERANCE_PERCENT, PROTEIN_TOLERANCE_MIN_GRAMS)
  const pDiff = Math.abs(diet.daily_protein - targetP)
  if (pDiff > pTolerance) {
    const direction = diet.daily_protein > targetP ? 'above' : 'below'
    errors.push(`Protein is ${pDiff.toFixed(0)}g ${direction} target (Target: ${targetP}g, Actual: ${diet.daily_protein.toFixed(0)}g)`)
  }

  const cTolerance = macroTolerance(targetC, CARBS_TOLERANCE_PERCENT, CARBS_TOLERANCE_MIN_GRAMS)
  const cDiff = Math.abs(diet.daily_carbs - targetC)
  if (cDiff > cTolerance) {
    const direction = diet.daily_carbs > targetC ? 'above' : 'below'
    errors.push(`Carbohydrates are ${cDiff.toFixed(0)}g ${direction} target (Target: ${targetC}g, Actual: ${diet.daily_carbs.toFixed(0)}g)`)
  }

  const fTolerance = macroTolerance(targetF, FAT_TOLERANCE_PERCENT, FAT_TOLERANCE_MIN_GRAMS)
  const fDiff = Math.abs(diet.daily_fat - targetF)
  if (fDiff > fTolerance) {
    const direction = diet.daily_fat > targetF ? 'above' : 'below'
    errors.push(`Fat is ${fDiff.toFixed(0)}g ${direction} target (Target: ${targetF}g, Actual: ${diet.daily_fat.toFixed(0)}g)`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
