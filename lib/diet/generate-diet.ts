import { calculateDiet, validateMacros, type FoodMacro, type CalculatedDiet } from '@/lib/nutrition/calculator'
import { solveDietQuantities } from '@/lib/nutrition/solver'
import type { TrainingTime } from '@/lib/nutrition/workoutMeals'

// Shared diet-generation engine used by both onboarding (app/onboarding/actions.ts)
// and meal-plan regeneration (app/settings/actions.ts), so both entry points go
// through the exact same DeepSeek prompt, retry policy, timeout, and validation.
export const MAX_ATTEMPTS = 4
export const ACTION_TIMEOUT_MS = 50000

export interface FoodOption extends FoodMacro {
  category: string
}

export interface GenerateDietParams {
  dbFoods: FoodOption[]
  calories: number
  protein: number
  carbs: number
  fat: number
  mealsCount: number
  // Food IDs that should NOT be assigned by the AI (e.g. supplements with
  // a fixed serving that the caller will append as a dedicated meal after
  // generation). These are excluded from both the prompt and the solver so
  // the AI never randomly splits them across meals.
  supplementFoodIds?: Set<string>
  // When the user trains, the AI should use workout-timed meal names
  // (Pre-Workout Meal, Post-Workout Meal) instead of generic Snacks.
  trainingTime?: TrainingTime | null
}

export type GenerateDietResult = { diet: CalculatedDiet } | { error: string }

interface ChatMessage {
  role: string
  content: string
}

export async function generateValidatedDiet(params: GenerateDietParams): Promise<GenerateDietResult> {
  const { dbFoods, calories, protein, carbs, fat, mealsCount, supplementFoodIds, trainingTime } = params

  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
  if (!DEEPSEEK_API_KEY) {
    return { error: 'Server misconfiguration: AI key missing' }
  }

  // Filter out supplement foods so the AI never assigns them to random meals.
  // Supplements are handled separately after generation (see onboarding/actions.ts).
  const aiEligibleFoods = supplementFoodIds && supplementFoodIds.size > 0
    ? dbFoods.filter(f => !supplementFoodIds.has(f.id))
    : dbFoods

  const foodContext = aiEligibleFoods.map(f => ({
    id: f.id,
    name: f.name,
    category: f.category,
    serving_size: f.serving_size,
    serving_unit: f.serving_unit,
    calories: f.calories,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat
  }))

  const feasibilityCheck = solveDietQuantities(aiEligibleFoods, calories, protein, carbs, fat)
  if (!feasibilityCheck.feasible) {
    return { error: feasibilityCheck.reason || 'Your selected foods cannot reach these macro targets within the allowed portions.' }
  }

  let attempt = 1
  let apiRetries = 0
  let finalValidatedDiet: CalculatedDiet | null = null
  let lastErrorClassification = 'UNKNOWN_GENERATION_ERROR'
  let lastValidationErrors: string[] = []
  let lastCalculatedMacros: { calories: number; protein: number; carbs: number; fat: number } | null = null

  // Build workout-specific meal naming instructions for training users
  const workoutMealInstructions = trainingTime
    ? `\n- WORKOUT NUTRITION: The user trains in the ${trainingTime}. Instead of generic "Snack" meals, use workout-specific timing:
  - Name one meal "Pre-Workout Meal" — focus on easy-to-digest carbohydrates, moderate protein, low fat
  - Name one meal "Post-Workout Meal" — focus on high-quality protein and fast/moderate carbohydrates for recovery
  - Remaining meals should be standard meals (Breakfast, Lunch, Dinner, etc.)
  - Do NOT use the name "Snack" or "Snacks" for any meal`
    : ''

  const systemPrompt = `You are a strict meal-planning engine.
Build a practical daily meal plan using ONLY the food IDs provided.
The nutrition values provided in this context are authoritative. Do not modify, estimate, or invent them.

REQUIREMENTS:
- Generate exactly ${mealsCount} meals.
- Hit these daily targets as closely as possible:
  Calories: ${calories} kcal
  Protein: ${protein}g
  Carbohydrates: ${carbs}g
  Fat: ${fat}g
- Improve food variety: Avoid using the exact same primary protein in every meal. Avoid identical meal compositions.
- Respect user preferences: You may ONLY select foods from the ALLOWED FOODS list.${workoutMealInstructions}

ALLOWED FOODS (Source of Truth for IDs, Units, and Macros per serving_size):
${JSON.stringify(foodContext, null, 2)}

OUTPUT FORMAT:
You MUST respond with valid JSON matching exactly this schema:
{
  "diet": {
    "name": "Personalized Diet",
    "meals": [
      {
        "name": "Breakfast",
        "foods": [
          {
            "food_id": "uuid-here"
          }
        ]
      }
    ]
  }
}`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Generate the meal plan.' }
  ]

  const actionStartTime = Date.now()

  while (attempt <= MAX_ATTEMPTS) {
    const elapsed = Date.now() - actionStartTime
    const timeRemaining = ACTION_TIMEOUT_MS - elapsed
    if (timeRemaining <= 0) {
      lastErrorClassification = 'PROVIDER_TIMEOUT'
      console.error(`[Generation Error] PROVIDER_TIMEOUT: Global deadline exceeded before validation attempt ${attempt}.`)
      return { error: 'DeepSeek AI is taking too long to respond. Please try again.' }
    }

    let response: Response;
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeRemaining)

    try {
      response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.2,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      })
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId)
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        lastErrorClassification = 'PROVIDER_TIMEOUT'
        console.error(`[Generation Error] PROVIDER_TIMEOUT on validation attempt ${attempt}, apiRetries ${apiRetries}.`)
        if (apiRetries < 3) { apiRetries++; continue; }
        return { error: 'DeepSeek AI is taking too long to respond. Please try again or adjust your targets.' }
      }
      lastErrorClassification = 'PROVIDER_NETWORK_ERROR'
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      console.error(`[Generation Error] PROVIDER_NETWORK_ERROR on validation attempt ${attempt}, apiRetries ${apiRetries}: ${msg}`)
      if (apiRetries < 3) { apiRetries++; continue; }
      return { error: 'A network error occurred while reaching the AI provider.' }
    }
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unreadable response body')
      const isRateLimit = response.status === 429
      const isServerError = response.status >= 500 && response.status < 600
      if (isRateLimit) {
        lastErrorClassification = 'PROVIDER_RATE_LIMIT'
        console.error(`[Generation Error] PROVIDER_RATE_LIMIT (429) on validation attempt ${attempt}, apiRetries ${apiRetries}: ${errorText.substring(0, 200)}`)
        if (apiRetries < 3) {
          apiRetries++
          await new Promise(r => setTimeout(r, 1000))
          continue
        }
      } else if (isServerError) {
        lastErrorClassification = 'PROVIDER_HTTP_ERROR'
        console.error(`[Generation Error] PROVIDER_HTTP_ERROR (${response.status}) on validation attempt ${attempt}, apiRetries ${apiRetries}: ${errorText.substring(0, 200)}`)
        if (apiRetries < 3) {
          apiRetries++
          continue
        }
      } else {
        lastErrorClassification = 'PROVIDER_HTTP_ERROR'
        console.error(`[Generation Error] PROVIDER_HTTP_ERROR (${response.status}) on validation attempt ${attempt}: Fatal 4xx error. ${errorText.substring(0, 200)}`)
      }
      return { error: 'An internal server error occurred while generating the diet.' }
    }

    let aiData
    try {
      aiData = await response.json()
    } catch {
      lastErrorClassification = 'PROVIDER_NETWORK_ERROR'
      console.error(`[Generation Error] PROVIDER_NETWORK_ERROR on validation attempt ${attempt}: Failed to parse JSON response from DeepSeek API.`)
      if (apiRetries < 3) { apiRetries++; continue; }
      return { error: 'An internal server error occurred while generating the diet.' }
    }

    const aiMessage = aiData.choices?.[0]?.message
    if (!aiMessage) {
      lastErrorClassification = 'INVALID_AI_OUTPUT'
      console.error(`[Generation Error] INVALID_AI_OUTPUT on validation attempt ${attempt}: Missing message in DeepSeek response.`)
      if (apiRetries < 3) { apiRetries++; continue; }
      return { error: 'An internal server error occurred while generating the diet.' }
    }

    let parsedDiet
    try {
      parsedDiet = JSON.parse(aiMessage.content)
    } catch {
      lastErrorClassification = 'JSON_PARSE_ERROR'
      console.error(`[Generation Error] JSON_PARSE_ERROR on validation attempt ${attempt}.`)
      messages.push(aiMessage)
      messages.push({ role: 'user', content: 'Your response was not valid JSON. Please return only valid JSON matching the schema.' })
      attempt++
      continue
    }

    if (!parsedDiet.diet || !Array.isArray(parsedDiet.diet.meals) || parsedDiet.diet.meals.length !== mealsCount) {
      lastErrorClassification = 'INVALID_AI_OUTPUT'
      console.error(`[Generation Error] INVALID_AI_OUTPUT on validation attempt ${attempt}: Incorrect JSON structure or meal count mismatch.`)
      messages.push(aiMessage)
      messages.push({ role: 'user', content: `Your JSON structure was incorrect or meal count mismatch. Expected exactly ${mealsCount} meals.` })
      attempt++
      continue
    }

    if (trainingTime) {
      const mealNames = parsedDiet.diet.meals.map((m: { name?: string }) => (m.name || '').toLowerCase())
      const hasSnack = mealNames.some((n: string) => n.includes('snack'))
      const hasPreWorkout = mealNames.some((n: string) => n.includes('pre-workout'))
      const hasPostWorkout = mealNames.some((n: string) => n.includes('post-workout'))

      if (hasSnack || !hasPreWorkout || !hasPostWorkout) {
        lastErrorClassification = 'INVALID_AI_OUTPUT'
        console.error(`[Generation Error] INVALID_AI_OUTPUT on validation attempt ${attempt}: AI generated invalid meal names for training user.`)
        messages.push(aiMessage)
        
        const feedback = []
        if (hasSnack) feedback.push('You included a "Snack" meal. Because this user trains, you MUST NOT use generic snacks.')
        if (!hasPreWorkout) feedback.push('You forgot to include the required "Pre-Workout Meal".')
        if (!hasPostWorkout) feedback.push('You forgot to include the required "Post-Workout Meal".')
        
        messages.push({ 
          role: 'user', 
          content: feedback.join(' ') + ' Correct this and try again.' 
        })
        attempt++
        continue
      }
    }

    // Step 2: The deterministic solver calculates quantities
    // First, collect all unique foods DeepSeek assigned to this diet
    const assignedFoodIds = new Set<string>()
    for (const meal of parsedDiet.diet.meals) {
      for (const food of meal.foods || []) {
        if (food.food_id) assignedFoodIds.add(food.food_id)
      }
    }

    const assignedDbFoods = aiEligibleFoods.filter(f => assignedFoodIds.has(f.id))
    // Check if the AI hallucinated invalid food IDs
    if (assignedDbFoods.length === 0 || assignedDbFoods.length !== assignedFoodIds.size) {
      lastErrorClassification = 'INVALID_AI_OUTPUT'
      console.error(`[Generation Error] INVALID_AI_OUTPUT on validation attempt ${attempt}: Hallucinated food IDs.`)
      messages.push(aiMessage)
      messages.push({ role: 'user', content: `You used food IDs that are not in the ALLOWED FOODS list. Only use the exact IDs provided.` })
      attempt++
      continue
    }

    const solverResult = solveDietQuantities(assignedDbFoods, calories, protein, carbs, fat)

    if (!solverResult.feasible) {
      lastErrorClassification = 'MACRO_VALIDATION_FAILURE'
      console.error(`[Generation Error] MACRO_VALIDATION_FAILURE on validation attempt ${attempt}: Solver determined selected structure is infeasible.`)
      messages.push(aiMessage)
      messages.push({ role: 'user', content: `The combination of foods you selected cannot satisfy the macro targets within valid portions. ${solverResult.reason || 'Try a different combination of foods.'}` })
      attempt++
      continue
    }

    // Distribute global solved quantities back to the meals
    // If a food appears in N meals, it gets 1/N of its total daily quantity per meal.
    const foodOccurrences: Record<string, number> = {}
    for (const meal of parsedDiet.diet.meals) {
      for (const food of meal.foods || []) {
        if (food.food_id) {
          foodOccurrences[food.food_id] = (foodOccurrences[food.food_id] || 0) + 1
        }
      }
    }

    for (const meal of parsedDiet.diet.meals) {
      for (const food of meal.foods || []) {
        if (food.food_id && solverResult.quantities[food.food_id]) {
          // Add the exact distributed quantity to the JSON structure for the calculator
          const totalQty = solverResult.quantities[food.food_id]
          const splits = foodOccurrences[food.food_id]
          // Math.floor to keep integers, might lose a gram or two but usually fine
          // (Solver tests show validateMacros handles minor discrepancies).
          // We can just use exact decimals and let UI round, or round now:
          food.quantity = Math.round(totalQty / splits)
          const dbFood = aiEligibleFoods.find(f => f.id === food.food_id)
          food.unit = dbFood ? dbFood.serving_unit : 'grams'
        }
      }
    }

    const { diet, error: calcError } = calculateDiet(
      parsedDiet.diet.name || "Personalized Diet",
      parsedDiet.diet.meals,
      aiEligibleFoods
    )

    if (calcError || !diet) {
      lastErrorClassification = 'MACRO_VALIDATION_FAILURE'
      console.error(`[Generation Error] MACRO_VALIDATION_FAILURE on validation attempt ${attempt}: Calculation error: ${calcError}`)
      messages.push(aiMessage)
      messages.push({ role: 'user', content: `Your meal plan failed calculation: ${calcError}. Correct this and try again.` })
      attempt++
      continue
    }

    const { valid, errors } = validateMacros(diet, calories, protein, carbs, fat)

    if (!valid) {
      // Extremely rare case: the solver thought it was valid, but calculateDiet rounding/splitting broke it.
      lastErrorClassification = 'MACRO_VALIDATION_FAILURE'
      lastValidationErrors = errors
      lastCalculatedMacros = {
        calories: diet.daily_calories,
        protein: diet.daily_protein,
        carbs: diet.daily_carbs,
        fat: diet.daily_fat
      }
      messages.push(aiMessage)
      messages.push({
        role: 'user',
        content: `Your previous meal plan failed server-side validation.

Target:
${calories} kcal
${protein}g protein
${carbs}g carbs
${fat}g fat

Calculated:
${diet.daily_calories.toFixed(0)} kcal
${diet.daily_protein.toFixed(0)}g protein
${diet.daily_carbs.toFixed(0)}g carbs
${diet.daily_fat.toFixed(0)}g fat

Problems:
- ${errors.join('\n- ')}

Generate a corrected meal plan.`
      })
      attempt++
      continue
    }

    // Success!
    finalValidatedDiet = diet
    break
  }

  if (!finalValidatedDiet) {
    if (lastErrorClassification === 'MACRO_VALIDATION_FAILURE' && lastCalculatedMacros) {
      console.error(`[Generation Error] MACRO_VALIDATION_FAILURE (Final) on attempt ${attempt - 1}. Targets: ${calories}kcal/${protein}P/${carbs}C/${fat}F. Calculated: ${lastCalculatedMacros.calories.toFixed(0)}kcal/${lastCalculatedMacros.protein.toFixed(0)}P/${lastCalculatedMacros.carbs.toFixed(0)}C/${lastCalculatedMacros.fat.toFixed(0)}F. Errors: ${lastValidationErrors.join(' | ')}`)
    } else {
      console.error(`[Generation Error] ${lastErrorClassification} (Final) on attempt ${attempt > MAX_ATTEMPTS ? MAX_ATTEMPTS : attempt - 1}.`)
    }
    return { error: 'Unable to generate your meal plan correctly. Please try again.' }
  }

  return { diet: finalValidatedDiet }
}
