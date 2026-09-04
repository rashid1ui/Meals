import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { ChevronRightIcon } from '@/components/ui/icons'
import DietEditor, { type FoodOption } from './components/DietEditor'
import SupplementsSection from './components/SupplementsSection'
import { SupplementsTrackingProvider } from '@/lib/supplements/SupplementsTrackingProvider'
import type { DraftMeal } from '@/lib/diet/diff'
import { sumMacros } from '@/lib/tracking/logic'
import { effectiveDailyTarget } from '@/lib/diet/effective-target'
import { getSupplements } from '@/lib/supplements/actions'

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

  // For a hand-built (user_created) plan the daily target the rings score
  // against is the plan's OWN food totals - the user chose those foods and
  // quantities deliberately. The onboarding recommendation stays on the row
  // (calories_target etc.) for reference. Every other plan is unchanged.
  // See lib/diet/effective-target.ts.
  const planFoodTotals = sumMacros(sortedMeals.flatMap(m => m.foods))
  const targets = effectiveDailyTarget(dietPlan, planFoodTotals)

  // Previous Plans: metadata-only list (no meals/foods fetched here - those
  // are only loaded when a specific previous plan is opened).
  const { data: previousPlans } = await supabase
    .from('diet_plans')
    .select('id, name, calories_target, protein_target, carbs_target, fat_target, created_at')
    .eq('user_id', user.id)
    .eq('is_active', false)
    .order('created_at', { ascending: false })

  const supplementsResult = await getSupplements()
  const initialSupplements = 'data' in supplementsResult ? supplementsResult.data : []

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header
        userName={profile?.full_name || 'Athlete'}
        userEmail={user.email || ''}
        avatarUrl={profile?.avatar_url}
        avatarFallback={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
      />

      <div className="max-w-6xl mx-auto p-6 mt-6 space-y-8 pb-20">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">Your Active Diet</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your progress, stay consistent, and reach your goals.
            </p>
          </div>
          <span className="shrink-0 bg-primary/15 text-primary px-4 py-2 rounded-full text-sm font-bold border border-primary/30">
            {dietPlan.name}
          </span>
        </div>

        <SupplementsTrackingProvider>
          <DietEditor
            key={dietPlan.id}
            initialMeals={initialMeals}
            targets={targets}
            foodOptions={foodOptions}
          />

          <SupplementsSection initialSupplements={initialSupplements} />
        </SupplementsTrackingProvider>

        <div className="space-y-6">
          <h2 className="font-display text-2xl font-bold text-foreground tracking-tight border-b border-border pb-4">
            Previous Plans
          </h2>

          {previousPlans && previousPlans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {previousPlans.map((plan) => (
                <Link key={plan.id} href={`/dashboard/plans/${plan.id}`} className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Card className="p-5 space-y-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-foreground truncate">{plan.name}</h3>
                      <Badge variant="neutral">Historical</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created{' '}
                      {plan.created_at
                        ? new Date(plan.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'date unknown'}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center font-mono tabular-nums text-xs pt-2 border-t border-border">
                      <div>
                        <div className="text-muted-foreground font-sans mb-0.5">Cal</div>
                        <div className="font-semibold text-foreground">{plan.calories_target}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-sans mb-0.5">Protein</div>
                        <div className="font-semibold text-protein">{plan.protein_target}g</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-sans mb-0.5">Carbs</div>
                        <div className="font-semibold text-carbs">{plan.carbs_target}g</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-sans mb-0.5">Fat</div>
                        <div className="font-semibold text-fat">{plan.fat_target}g</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-semibold text-primary pt-1">
                      View Plan
                      <ChevronRightIcon size={14} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-sm font-semibold text-foreground">No previous plans yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your previous meal plans will appear here after you generate a new plan.
              </p>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
