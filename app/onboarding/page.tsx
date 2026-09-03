import OnboardingForm from './OnboardingForm'
import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadServerOnboardingDraft } from './draft-actions'

export const maxDuration = 60

type OnboardingPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const { newPlan } = await searchParams
  const isNewPlanFlow = newPlan === 'true'

  const supabase = await createClient()

  const { data: dbFoods, error: dbError } = await supabase
    .from('food_database')
    .select('id, name, category, protein_type')
    .eq('is_active', true)
    .order('name')

  if (dbError) {
    console.error('Failed to load food_database:', dbError)
  }

  // Supplements (whey/creatine/other configured via the Training Nutrition
  // Setup step, or any food a user tagged Protein Source = Supplement) only
  // ever appear through the dedicated supplement flow - never the general
  // food picker or AI candidate pool (app/onboarding/actions.ts already
  // excludes protein_type='supplement' rows there too). Filtered in JS
  // rather than a `.neq('protein_type', 'supplement')` query, since Postgres
  // NULL semantics would make that filter also exclude every food with no
  // protein_type set at all.
  const selectableFoods = (dbFoods || []).filter(f => f.protein_type !== 'supplement')

  // The manual meal builder's own food library - unlike `selectableFoods`
  // above (which exists only to feed the untouched, unreachable AI steps),
  // this one DOES include supplement rows, so a configured whey/creatine
  // supplement is directly searchable/addable as a regular food in the
  // builder rather than needing separate injection logic. The `.or` mirrors
  // the food_database SELECT RLS policy from
  // supabase/migrations/0014_food_database_supplement_select_rls.sql exactly
  // (is_active=true OR category='supplement') - manual-actions.ts's
  // createManualDietPlan re-verifies every submitted food against the same
  // filter server-side, so this is a read-time convenience, not a trust
  // boundary.
  const { data: manualFoodRows, error: manualFoodError } = await supabase
    .from('food_database')
    .select(
      'id, name, category, protein_type, carb_type, serving_size, serving_unit, calories, protein, carbs, fat, display_unit, grams_per_display_unit'
    )
    .or('is_active.eq.true,category.eq.supplement')
    .order('name')

  if (manualFoodError) {
    console.error('Failed to load manual meal builder food library:', manualFoodError)
  }

  const manualFoodOptions = manualFoodRows || []

  // Pre-fills the new Profile/Goal steps from whatever the user last saved,
  // so the regenerate-plan flow (?newPlan=true, "change goal later") opens
  // with real values instead of blank. Both are best-effort - a first-time
  // user simply has no profile row / no active plan yet, and the wizard
  // falls back to its normal empty state.
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: activePlans } = await supabase
    .from('diet_plans')
    .select('id, goal')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const { data: notificationPrefs } = await supabase
    .from('notification_preferences')
    .select('reminders_enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  // Cross-device onboarding continuity: the account-scoped copy of an
  // in-progress wizard draft (public.onboarding_drafts, migration 0025).
  // OnboardingForm reconciles this against its own localStorage draft and
  // resumes from whichever was saved more recently - so starting onboarding
  // on one device and opening the same account on another continues where
  // it left off instead of showing a blank wizard.
  const serverDraft = await loadServerOnboardingDraft()

  // Regenerate-plan flow only: prefill the Reminders step from the plan
  // being replaced, by position (sort_order) - same "reopen with last-saved
  // values" treatment as Profile/Goal above. A first-time onboarding has no
  // active plan yet, so this is simply null.
  const activePlanId = activePlans?.[0]?.id
  const { data: previousMeals } = activePlanId
    ? await supabase
        .from('meals')
        .select('sort_order, reminder_time, reminder_enabled')
        .eq('diet_plan_id', activePlanId)
        .order('sort_order')
    : { data: null }

  const initialMealReminders = previousMeals?.map(m => ({
    time: m.reminder_time ? String(m.reminder_time).slice(0, 5) : null,
    enabled: m.reminder_enabled
  })) ?? null

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full py-12">
        <OnboardingForm
          foods={selectableFoods}
          isNewPlanFlow={isNewPlanFlow}
          initialProfile={profile}
          initialGoal={activePlans?.[0]?.goal ?? null}
          initialRemindersEnabled={notificationPrefs?.reminders_enabled ?? null}
          initialMealReminders={initialMealReminders}
          manualFoodOptions={manualFoodOptions}
          initialServerDraft={serverDraft}
        />
      </div>
    </main>
  )
}
