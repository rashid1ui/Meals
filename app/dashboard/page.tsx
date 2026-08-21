import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/SignOutButton'
import Avatar from '@/components/Avatar'
import Link from 'next/link'
import DietEditor, { type FoodOption } from './components/DietEditor'
import type { DraftMeal } from '@/lib/diet/diff'

// Narrow, hand-verified shapes for the `meals`/`foods` query result below.
// There is no generated Supabase Database type in this project (no live DB
// connection is available to generate one), so these mirror exactly what
// app/dashboard/actions.ts's insert calls write to these same tables.
interface FoodRow {
  id: string
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  sort_order: number
}

interface MealRow {
  id: string
  name: string
  sort_order: number
  foods: FoodRow[]
}

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
    .eq('is_active', true)
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
  const sortedMeals = (meals as MealRow[] | null)?.map(m => ({
    ...m,
    foods: m.foods.sort((a, b) => a.sort_order - b.sort_order)
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
    foods: meal.foods.map((food) => {
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

  // Previous Plans: metadata-only list (no meals/foods fetched here - those
  // are only loaded when a specific previous plan is opened).
  const { data: previousPlans } = await supabase
    .from('diet_plans')
    .select('id, name, calories_target, protein_target, carbs_target, fat_target, created_at')
    .eq('user_id', user.id)
    .eq('is_active', false)
    .order('created_at', { ascending: false })

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
          <Avatar
            src={profile?.avatar_url}
            alt="Avatar"
            fallbackText={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
          />
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

        {previousPlans && previousPlans.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-4">Previous Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {previousPlans.map((plan) => (
                <Link
                  key={plan.id}
                  href={`/dashboard/plans/${plan.id}`}
                  className="bg-[#161B22] border border-gray-800 rounded-3xl p-5 shadow-xl hover:border-indigo-500/40 transition-colors block"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold truncate">{plan.name}</h3>
                    <span className="text-xs text-gray-500 shrink-0 ml-2">
                      {plan.created_at ? new Date(plan.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs text-center">
                    <div>
                      <div className="text-gray-500">Cal</div>
                      <div className="font-semibold text-white">{plan.calories_target}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Protein</div>
                      <div className="font-semibold text-blue-400">{plan.protein_target}g</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Carbs</div>
                      <div className="font-semibold text-orange-400">{plan.carbs_target}g</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Fat</div>
                      <div className="font-semibold text-yellow-400">{plan.fat_target}g</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
