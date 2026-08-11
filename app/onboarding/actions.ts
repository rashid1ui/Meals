'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth/get-user'

const CALORIE_TOLERANCE = 0.05
const PROTEIN_TOLERANCE = 5
const CARBS_TOLERANCE = 10
const FAT_TOLERANCE = 5
const MAX_ATTEMPTS = 3

function isValidQuantity(quantity: number, unit: string) {
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
  const carbs = parseInt(formData.get('carbs') as string)
  const fat = parseInt(formData.get('fat') as string)
  const mealsCount = parseInt(formData.get('meals') as string)
  
  const proteinsList = JSON.parse(formData.get('proteins') as string || '[]')
  const carbsList = JSON.parse(formData.get('carbs') as string || '[]')
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
    serving_unit: f.serving_unit
  }))

  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
  if (!DEEPSEEK_API_KEY) {
    return { error: 'Server misconfiguration: AI key missing' }
  }

  let attempt = 1
  let lastErrorReason = ""
  let finalValidatedDiet = null

  while (attempt <= MAX_ATTEMPTS) {
    const systemPrompt = `You are a strict meal-planning engine.
Build a practical daily meal plan using ONLY the food IDs provided.
You are NOT responsible for nutritional facts. Never invent calories, protein, carbs, fat, or nutritional values.
Only select food IDs and quantities.

REQUIREMENTS:
- Generate exactly ${mealsCount} meals.
- Hit these daily targets as closely as possible based on standard nutritional math:
  Calories: ${calories}
  Protein: ${protein}g
  Carbohydrates: ${carbs}g
  Fat: ${fat}g
- You can use the same food across multiple meals if it makes culinary sense.

ALLOWED FOODS (Source of Truth for IDs and Units):
${JSON.stringify(foodContext, null, 2)}

${lastErrorReason ? `PREVIOUS ATTEMPT FAILED BECAUSE: ${lastErrorReason}\nPlease adjust the quantities or food selections to fix this.` : ''}

OUTPUT FORMAT:
Return ONLY raw, valid JSON. No markdown fences.
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

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Generate the meal plan.' }
          ],
          temperature: 0.2
        })
      })

      if (!response.ok) {
        throw new Error('AI Provider Error')
      }

      const aiData = await response.json()
      let jsonStr = aiData.choices[0].message.content.trim()
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '')
      
      let parsedDiet
      try {
        parsedDiet = JSON.parse(jsonStr)
      } catch (e) {
        lastErrorReason = "Your last response was not valid JSON."
        attempt++
        continue
      }

      if (!parsedDiet.diet || !Array.isArray(parsedDiet.diet.meals) || parsedDiet.diet.meals.length !== mealsCount) {
        lastErrorReason = `Your JSON structure was incorrect or meal count mismatch.`
        attempt++
        continue
      }

      let validStructure = true
      let dailyP = 0, dailyC = 0, dailyF = 0, dailyK = 0
      
      const validatedResponse = {
        name: parsedDiet.diet.name || "Personalized Diet",
        meals: [] as any[]
      }

      for (let mIdx = 0; mIdx < parsedDiet.diet.meals.length; mIdx++) {
        const meal = parsedDiet.diet.meals[mIdx]
        const validatedMeal = {
          name: meal.name || `Meal \${mIdx + 1}`,
          sort_order: mIdx,
          foods: [] as any[]
        }

        for (const item of meal.foods || []) {
          const dbFood = dbFoods.find(f => f.id === item.food_id)
          if (!dbFood) {
            lastErrorReason = `You used an invalid food_id: \${item.food_id}.`
            validStructure = false
            break
          }
          if (!isValidQuantity(item.quantity, dbFood.serving_unit)) {
            lastErrorReason = `You provided an invalid or absurd quantity (\${item.quantity}) for unit (\${dbFood.serving_unit}) for food \${dbFood.name}.`
            validStructure = false
            break
          }

          const multiplier = item.quantity / dbFood.serving_size
          const p = dbFood.protein * multiplier
          const c = dbFood.carbs * multiplier
          const f = dbFood.fat * multiplier
          const k = dbFood.calories * multiplier

          validatedMeal.foods.push({
            food_id: dbFood.id,
            name: dbFood.name,
            quantity: item.quantity,
            unit: dbFood.serving_unit,
            protein: p,
            carbs: c,
            fat: f,
            calories: k
          })

          dailyP += p
          dailyC += c
          dailyF += f
          dailyK += k
        }
        if (!validStructure) break
        validatedResponse.meals.push(validatedMeal)
      }

      if (!validStructure) {
        attempt++
        continue
      }

      const calDiff = Math.abs(dailyK - calories)
      if (calDiff > (calories * CALORIE_TOLERANCE)) {
        lastErrorReason = `Total calories deviated from target by more than 5%.`
        attempt++
        continue
      }
      if (Math.abs(dailyP - protein) > PROTEIN_TOLERANCE) {
        lastErrorReason = `Total protein deviated from target by more than \${PROTEIN_TOLERANCE}g.`
        attempt++
        continue
      }
      if (Math.abs(dailyC - carbs) > CARBS_TOLERANCE) {
        lastErrorReason = `Total carbs deviated from target by more than \${CARBS_TOLERANCE}g.`
        attempt++
        continue
      }
      if (Math.abs(dailyF - fat) > FAT_TOLERANCE) {
        lastErrorReason = `Total fat deviated from target by more than \${FAT_TOLERANCE}g.`
        attempt++
        continue
      }

      // Success!
      finalValidatedDiet = validatedResponse
      break

    } catch (err) {
      console.error(err)
      return { error: 'An internal server error occurred while generating the diet.' }
    }
  }

  if (!finalValidatedDiet) {
    return { error: 'AI failed to generate a valid diet within required tolerances after 3 attempts. Try adjusting targets.' }
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
