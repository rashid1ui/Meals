import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Header from '@/components/ui/Header'
import { ChevronLeftIcon } from '@/components/ui/icons'
import InsightsView from './InsightsView'
import { sumMacros, type MacroTotals } from '@/lib/tracking/logic'
import { effectiveDailyTarget } from '@/lib/diet/effective-target'

export default async function InsightsPage() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  // Active diet plan — needed for protein target + goal (WorkoutMealRecommendations)
  const { data: dietPlans } = await supabase
    .from('diet_plans')
    .select('id, plan_source, calories_target, protein_target, carbs_target, fat_target, goal')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const dietPlan = dietPlans?.[0]

  // A hand-built plan is scored against its own food totals, matching the
  // dashboard (lib/diet/effective-target.ts). Every other plan keeps its
  // stored *_target columns.
  const { data: planMeals } = dietPlan
    ? await supabase.from('meals').select('foods(calories, protein, carbs, fat)').eq('diet_plan_id', dietPlan.id)
    : { data: null }

  const targets = dietPlan
    ? effectiveDailyTarget(
        dietPlan,
        sumMacros(((planMeals as { foods: MacroTotals[] }[] | null) || []).flatMap(m => m.foods))
      )
    : null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header
        userName={profile?.full_name || 'Athlete'}
        userEmail={user.email || ''}
        avatarUrl={profile?.avatar_url}
        avatarFallback={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
      />

      <div className="max-w-3xl mx-auto p-6 mt-6 space-y-8 pb-20">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">Insights</h1>
            <p className="text-sm text-muted-foreground mt-1">Your nutrition analytics center — protein breakdown, workout nutrition, and progress trends.</p>
          </div>
          <Link
            href="/dashboard"
            className="min-h-[44px] flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
          >
            <ChevronLeftIcon size={16} />
            Back to Dashboard
          </Link>
        </div>

        <InsightsView
          targets={targets}
          trainingTime={profile?.training_time ?? null}
          trainingTimeCustom={profile?.training_time_custom ?? null}
          goal={dietPlan?.goal ?? null}
        />
      </div>
    </main>
  )
}
