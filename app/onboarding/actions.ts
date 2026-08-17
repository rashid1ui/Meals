'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth/get-user'
import { calculateDiet, validateMacros, type FoodMacro } from '@/lib/nutrition/calculator'

const MAX_ATTEMPTS = 4

export async function submitOnboarding(formData: FormData) {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  // Prevent duplicate diet generation - Check 1: Existing Plans
  const { data: existingPlans } = await supabase
    .from('diet_plans')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (existingPlans && existingPlans.length > 0) {
    // Already onboarded
    const cookieStore = await cookies()
    cookieStore.set('gym_meals_onboarded', 'true', { path: '/' })
    redirect('/dashboard')
  }

  // Prevent duplicate diet generation - Check 2: Optimistic Concurrency Lock
  // Because Vercel serverless functions cannot share in-memory locks, we use
  // the existing 'profiles' table to achieve a database-level lock safely.
  const { data: profile } = await supabase
    .from('profiles')
    .select('updated_at')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const newTimestamp = new Date().toISOString()
  const { data: lockData, error: lockError } = await supabase
    .from('profiles')
    .update({ updated_at: newTimestamp })
    .eq('id', user.id)
    .eq('updated_at', profile.updated_at)
    .select('id')

  if (lockError || !lockData || lockData.length === 0) {
    // The updated_at timestamp changed since we read it. This proves a concurrent
    // request is already processing this user's onboarding. Abort safely.
    return { error: 'Your request is currently being processed. Please wait.' }
  }

  // Parse inputs
  const calories = parseInt(formData.get('calories') as string)
  const protein = parseInt(formData.get('protein') as string)
  const carbs = parseInt(formData.get('carbsTarget') as string)
  const fat = parseInt(formData.get('fat') as string)
  const mealsCount = parseInt(formData.get('meals') as string)
  
  const proteinsList = JSON.parse(formData.get('proteins') as string || '[]')
  const carbsList = JSON.parse(formData.get('carbFoodIds') as string || '[]')
  const fatsList = JSON.parse(formData.get('fats') as string || '[]')

  if (!calories || !protein || !carbs || !fat || !mealsCount) {
    return { error: 'Missing macro targets' }
  }

  if (proteinsList.length === 0 || carbsList.length === 0 || fatsList.length === 0) {
    return { error: 'Must provide at least one food ID for each category.' }
  }

  const allRequestedIds = [...new Set([...proteinsList, ...carbsList, ...fatsList])]

  // Fetch foods from DB to use in prompt
  const { data: dbFoods, error: dbError } = await supabase
    .from('food_database')
    .select('*')
    .in('id', allRequestedIds)
    .eq('is_active', true)

  if (dbError || !dbFoods || dbFoods.length !== allRequestedIds.length) {
    return { error: 'One or more requested foods are inactive or do not exist.' }
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

  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
  if (!DEEPSEEK_API_KEY) {
    return { error: 'Server misconfiguration: AI key missing' }
  }

  let attempt = 1
  let finalValidatedDiet = null

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

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Generate the meal plan.' }
  ]

  const ACTION_TIMEOUT_MS = 50000
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
      } catch (e) {
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
        dbFoods as unknown as FoodMacro[]
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

  // 1. Insert Diet Plan
  const { data: newPlan, error: insertPlanError } = await supabase
    .from('diet_plans')
    .insert({
      user_id: user.id,
      name: finalValidatedDiet.name,
      calories_target: calories,
      protein_target: protein,
      carbs_target: carbs,
      fat_target: fat
    })
    .select()
    .single()

  if (insertPlanError || !newPlan) {
    return { error: 'Failed to save diet plan.' }
  }

  // Transaction fallback using manual rollback
  try {
    for (const meal of finalValidatedDiet.meals) {
      const { data: newMeal, error: insertMealError } = await supabase
        .from('meals')
        .insert({
          user_id: user.id,
          diet_plan_id: newPlan.id,
          name: meal.name,
          sort_order: meal.sort_order
        })
        .select()
        .single()
      
      if (insertMealError || !newMeal) throw new Error('Meal insert failed')

      const foodsToInsert = meal.foods.map((food: any, idx: number) => ({
        user_id: user.id,
        meal_id: newMeal.id,
        name: food.name,
        quantity: food.quantity,
        unit: food.unit,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
        calories: food.calories,
        sort_order: idx
      }))

      const { error: foodsError } = await supabase.from('foods').insert(foodsToInsert)
      if (foodsError) throw new Error('Food insert failed')
    }

    // Set cookie to speed up middleware
    const cookieStore = await cookies()
    cookieStore.set('gym_meals_onboarded', 'true', {
      path: '/',
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    })

  } catch (err) {
    // Rollback diet plan
    await supabase.from('diet_plans').delete().eq('id', newPlan.id)
    return { error: 'Failed to save meals. Rolling back.' }
  }

  // Update profile modified_at just in case
  await supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', user.id)

  redirect('/dashboard')
}
