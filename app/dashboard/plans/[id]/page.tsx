import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

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

type PageProps = {
  params: Promise<{ id: string }>
}

// Read-only view of a previous (inactive) plan. Ownership is enforced
// server-side via .eq('user_id', user.id) - the URL param alone is never
// trusted. No editing affordances here by design (previous plans are
// read-only for now, per the task).
export default async function PreviousPlanPage({ params }: PageProps) {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  const { id } = await params

  const supabase = await createClient()

  const { data: plan } = await supabase
    .from('diet_plans')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!plan) {
    notFound()
  }

  const { data: meals } = await supabase
    .from('meals')
    .select('*, foods(*)')
    .eq('diet_plan_id', plan.id)
    .order('sort_order')

  const sortedMeals = (meals as MealRow[] | null)?.map(m => ({
    ...m,
    foods: m.foods.sort((a, b) => a.sort_order - b.sort_order)
  })) || []

  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0
  sortedMeals.forEach(meal => {
    meal.foods.forEach(food => {
      totalCal += Number(food.calories)
      totalP += Number(food.protein)
      totalC += Number(food.carbs)
      totalF += Number(food.fat)
    })
  })

  return (
    <main className="min-h-screen bg-[#0B0E14] text-white font-['Outfit',sans-serif]">
      <nav className="w-full bg-[#161B22] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold">
            GM
          </div>
          <span className="font-bold text-xl tracking-tight">Gym Meals</span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
        >
          &larr; Back to Dashboard
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto p-6 mt-6 space-y-8 pb-20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{plan.name}</h1>
          <span className="bg-gray-700/30 text-gray-300 px-4 py-2 rounded-full text-sm font-bold border border-gray-600/40">
            Previous Plan (read-only)
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
            <div className="text-gray-400 text-sm font-semibold mb-1">Calories</div>
            <div className="text-3xl font-black text-white">{Math.round(totalCal)}</div>
            <div className="text-xs text-gray-500 mt-1">Target: {plan.calories_target}</div>
          </div>
          <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
            <div className="text-gray-400 text-sm font-semibold mb-1">Protein</div>
            <div className="text-3xl font-black text-blue-400">{Math.round(totalP)}g</div>
            <div className="text-xs text-gray-500 mt-1">Target: {plan.protein_target}g</div>
          </div>
          <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
            <div className="text-gray-400 text-sm font-semibold mb-1">Carbs</div>
            <div className="text-3xl font-black text-orange-400">{Math.round(totalC)}g</div>
            <div className="text-xs text-gray-500 mt-1">Target: {plan.carbs_target}g</div>
          </div>
          <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
            <div className="text-gray-400 text-sm font-semibold mb-1">Fat</div>
            <div className="text-3xl font-black text-yellow-400">{Math.round(totalF)}g</div>
            <div className="text-xs text-gray-500 mt-1">Target: {plan.fat_target}g</div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-4">Meals</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sortedMeals.map((meal) => {
              const mealCal = meal.foods.reduce((sum, f) => sum + Number(f.calories), 0)
              const mealP = meal.foods.reduce((sum, f) => sum + Number(f.protein), 0)
              const mealC = meal.foods.reduce((sum, f) => sum + Number(f.carbs), 0)
              const mealF = meal.foods.reduce((sum, f) => sum + Number(f.fat), 0)

              return (
                <div key={meal.id} className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
                    <h3 className="text-xl font-bold">{meal.name}</h3>
                    <div className="text-sm text-gray-400 font-semibold bg-gray-800/50 px-3 py-1 rounded-full">
                      {Math.round(mealCal)} kcal
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    {meal.foods.map((food) => (
                      <div key={food.id} className="flex items-center justify-between p-3 rounded-2xl bg-[#0B0E14] border border-gray-800/60">
                        <div>
                          <div className="font-semibold text-gray-200">{food.name}</div>
                          <div className="text-xs text-gray-500">{food.quantity} {food.unit}</div>
                        </div>
                        <div className="flex gap-3 text-xs font-semibold">
                          <span className="text-blue-400">{Math.round(food.protein)}p</span>
                          <span className="text-orange-400">{Math.round(food.carbs)}c</span>
                          <span className="text-yellow-400">{Math.round(food.fat)}f</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-800/50 flex justify-between text-xs text-gray-500">
                    <span>Meal Totals:</span>
                    <div className="flex gap-4">
                      <span>{Math.round(mealP)}g P</span>
                      <span>{Math.round(mealC)}g C</span>
                      <span>{Math.round(mealF)}g F</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
