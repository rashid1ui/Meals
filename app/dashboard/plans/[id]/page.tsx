import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { ChevronLeftIcon, ClockIcon } from '@/components/ui/icons'
import { formatMealName } from '@/lib/nutrition/workoutMeals'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

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

  const createdLabel = plan.created_at
    ? new Date(plan.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header
        userName={profile?.full_name || 'Athlete'}
        userEmail={user.email || ''}
        avatarUrl={profile?.avatar_url}
        avatarFallback={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
      />

      <div className="max-w-6xl mx-auto p-6 mt-6 space-y-8 pb-20">
        <Link
          href="/dashboard"
          className="min-h-[44px] inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
        >
          <ChevronLeftIcon size={16} />
          Back to Dashboard
        </Link>

        {/* Persistent historical banner - impossible to miss */}
        <div className="rounded-card border border-border bg-surface-elevated px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-muted-foreground shrink-0">
            <ClockIcon size={18} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Previous Plan</div>
            <p className="text-sm text-foreground mt-1">
              You&apos;re viewing a previous meal plan. This plan is read-only and does not affect your active plan.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">{plan.name}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">Historical</Badge>
            {createdLabel && <span className="text-xs text-muted-foreground">Created {createdLabel}</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-6 flex flex-col items-center">
            <div className="text-muted-foreground text-sm font-semibold mb-1">Calories</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-calories">{Math.round(totalCal)}</div>
            <div className="text-xs text-muted-foreground mt-1">Target: {plan.calories_target}</div>
          </Card>
          <Card className="p-6 flex flex-col items-center">
            <div className="text-muted-foreground text-sm font-semibold mb-1">Protein</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-protein">{Math.round(totalP)}g</div>
            <div className="text-xs text-muted-foreground mt-1">Target: {plan.protein_target}g</div>
          </Card>
          <Card className="p-6 flex flex-col items-center">
            <div className="text-muted-foreground text-sm font-semibold mb-1">Carbs</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-carbs">{Math.round(totalC)}g</div>
            <div className="text-xs text-muted-foreground mt-1">Target: {plan.carbs_target}g</div>
          </Card>
          <Card className="p-6 flex flex-col items-center">
            <div className="text-muted-foreground text-sm font-semibold mb-1">Fat</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-fat">{Math.round(totalF)}g</div>
            <div className="text-xs text-muted-foreground mt-1">Target: {plan.fat_target}g</div>
          </Card>
        </div>

        <div className="space-y-6">
          <h2 className="font-display text-2xl font-bold text-foreground tracking-tight border-b border-border pb-4">
            Meals
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sortedMeals.map((meal) => {
              const mealCal = meal.foods.reduce((sum, f) => sum + Number(f.calories), 0)
              const mealP = meal.foods.reduce((sum, f) => sum + Number(f.protein), 0)
              const mealC = meal.foods.reduce((sum, f) => sum + Number(f.carbs), 0)
              const mealF = meal.foods.reduce((sum, f) => sum + Number(f.fat), 0)

              return (
                <Card key={meal.id} className="p-6 flex flex-col">
                  <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                    <h3 className="font-display text-xl font-bold text-foreground">{formatMealName(meal.name)}</h3>
                    <div className="font-mono tabular-nums text-sm font-semibold text-muted-foreground bg-surface-elevated border border-border px-3 py-1 rounded-full">
                      {Math.round(mealCal)} kcal
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    {meal.foods.map((food) => (
                      <div key={food.id} className="flex items-center justify-between gap-3 p-3 rounded-control bg-background border border-border">
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{food.name}</div>
                          <div className="text-xs text-muted-foreground font-mono tabular-nums">
                            {food.quantity} {food.unit}
                          </div>
                        </div>
                        <div className="flex gap-3 font-mono tabular-nums text-xs font-semibold shrink-0">
                          <span className="text-protein">{Math.round(food.protein)}p</span>
                          <span className="text-carbs">{Math.round(food.carbs)}c</span>
                          <span className="text-fat">{Math.round(food.fat)}f</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                    <span>Meal Totals:</span>
                    <div className="flex gap-4 font-mono tabular-nums">
                      <span className="text-protein">{Math.round(mealP)}g P</span>
                      <span className="text-carbs">{Math.round(mealC)}g C</span>
                      <span className="text-fat">{Math.round(mealF)}g F</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
