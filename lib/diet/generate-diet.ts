import { calculateDiet, validateMacros, type FoodMacro, type CalculatedDiet } from '@/lib/nutrition/calculator'

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
}

export type GenerateDietResult = { diet: CalculatedDiet } | { error: string }

interface ChatMessage {
  role: string
  content: string
}

export async function generateValidatedDiet(params: GenerateDietParams): Promise<GenerateDietResult> {
  const { dbFoods, calories, protein, carbs, fat, mealsCount } = params

  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
  if (!DEEPSEEK_API_KEY) {
    return { error: 'Server misconfiguration: AI key missing' }
  }

  const foodContext = dbFoods.map(f => ({
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

  let attempt = 1
  let finalValidatedDiet: CalculatedDiet | null = null

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
- Respect user preferences: You may ONLY select foods from the ALLOWED FOODS list.

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
            "food_id": "uuid-here",
            "quantity": 100,
            "unit": "grams"
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
    if (elapsed > ACTION_TIMEOUT_MS) {
      return { error: 'DeepSeek AI is taking too long to respond. Please try again.' }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS - elapsed)

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
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

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error('AI Provider Error')
      }

      const aiData = await response.json()
      const aiMessage = aiData.choices[0].message

      let parsedDiet
      try {
        parsedDiet = JSON.parse(aiMessage.content)
      } catch {
        messages.push(aiMessage)
        messages.push({ role: 'user', content: 'Your response was not valid JSON. Please return only valid JSON matching the schema.' })
        attempt++
        continue
      }

      if (!parsedDiet.diet || !Array.isArray(parsedDiet.diet.meals) || parsedDiet.diet.meals.length !== mealsCount) {
        messages.push(aiMessage)
        messages.push({ role: 'user', content: `Your JSON structure was incorrect or meal count mismatch. Expected exactly ${mealsCount} meals.` })
        attempt++
        continue
      }

      const { diet, error: calcError } = calculateDiet(
        parsedDiet.diet.name || "Personalized Diet",
        parsedDiet.diet.meals,
        dbFoods
      )

      if (calcError || !diet) {
        messages.push(aiMessage)
        messages.push({ role: 'user', content: `Your meal plan failed calculation: ${calcError}. Correct this and try again.` })
        attempt++
        continue
      }

      const { valid, errors } = validateMacros(diet, calories, protein, carbs, fat)

      if (!valid) {
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

    } catch (err: unknown) {
      console.error(err)
      if (err instanceof Error && err.name === 'AbortError') {
        return { error: 'DeepSeek AI is taking too long to respond. Please try again or adjust your targets.' }
      }
      return { error: 'An internal server error occurred while generating the diet.' }
    }
  }

  if (!finalValidatedDiet) {
    return { error: `AI failed to generate a valid diet within required tolerances after ${MAX_ATTEMPTS} attempts. Try adjusting targets.` }
  }

  return { diet: finalValidatedDiet }
}
