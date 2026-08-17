import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/SignOutButton'
import Image from 'next/image'
import Link from 'next/link'
import DietEditor, { type FoodOption } from './components/DietEditor'
import type { DraftMeal } from '@/lib/diet/diff'

export default async function DashboardPage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: dietPlans } = await supabase
    .from('diet_plans')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)

  const dietPlan = dietPlans?.[0]

  // If we made it past middleware but there's no diet plan, force onboarding
  if (!dietPlan) {
    redirect('/onboarding')
  }

  const { data: meals } = await supabase
    .from('meals')
    .select('*, foods(*)')
    .eq('diet_plan_id', dietPlan.id)
    .order('sort_order')

  // Sort foods inside meals
  const sortedMeals = meals?.map(m => ({
    ...m,
    foods: m.foods.sort((a: any, b: any) => a.sort_order - b.sort_order)
  })) || []

  // Active food_database rows power both the Add-Food search picker and the
  // live per-100g baseline used to recalculate quantity edits. Existing plan
  // foods don't carry a food_database FK (the `foods` table only stores
  // already-scaled absolute values), so each one is resolved by matching its
  // name back to this list - the same reconciliation approach already used
  // for meal-plan regeneration. A food whose name no longer resolves (e.g.
  // renamed/deactivated since generation) is passed through as quantity-locked
  // rather than silently mis-scaled.
  const { data: foodDatabaseRows } = await supabase
    .from('food_database')
    .select('*')
    .eq('is_active', true)
    .order('name')

  const foodOptions: FoodOption[] = foodDatabaseRows || []
  const foodDatabaseByName = new Map(foodOptions.map(f => [f.name, f]))

  const initialMeals: DraftMeal[] = sortedMeals.map(meal => ({
    id: meal.id,
    name: meal.name,
    sortOrder: meal.sort_order,
    foods: meal.foods.map((food: any) => {
      const match = foodDatabaseByName.get(food.name)
      return {
        id: food.id,
        foodDatabaseId: match ? match.id : null,
        name: food.name,
        quantity: Number(food.quantity),
        unit: food.unit,
        calories: Number(food.calories),
        protein: Number(food.protein),
        carbs: Number(food.carbs),
        fat: Number(food.fat)
      }
    })
  }))

  const targets = {
    calories: dietPlan.calories_target,
    protein: dietPlan.protein_target,
    carbs: dietPlan.carbs_target,
    fat: dietPlan.fat_target
  }

  return (
    <main className="min-h-screen bg-[#0B0E14] text-white font-['Outfit',sans-serif]">
      {/* Top Navigation */}
      <nav className="w-full bg-[#161B22] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold">
            GM
          </div>
          <span className="font-bold text-xl tracking-tight">Gym Meals</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold">{profile?.full_name || 'Athlete'}</div>
            <div className="text-xs text-gray-400">{user.email}</div>
          </div>
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt="Avatar" 
              className="w-10 h-10 rounded-full border-2 border-indigo-500/30 object-cover" 
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center">
              {profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
            </div>
          )}
          <Link
            href="/settings"
            className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
          >
            Settings
          </Link>
          <div className="ml-2 pl-4 border-l border-gray-700">
            <SignOutButton />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-6 mt-6 space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">Your Active Diet</h1>
          <span className="bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-full text-sm font-bold border border-indigo-500/30">
            {dietPlan.name}
          </span>
        </div>

        <DietEditor
          key={dietPlan.id}
          initialMeals={initialMeals}
          targets={targets}
          foodOptions={foodOptions}
        />
      </div>
    </main>
  )
}
