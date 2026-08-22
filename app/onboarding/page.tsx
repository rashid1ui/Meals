import OnboardingForm from './OnboardingForm'
import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
    .select('id, name, category')
    .eq('is_active', true)
    .order('name')

  if (dbError) {
    console.error('Failed to load food_database:', dbError)
  }

  // Pre-fills the new Profile/Goal steps from whatever the user last saved,
  // so the regenerate-plan flow (?newPlan=true, "change goal later") opens
  // with real values instead of blank. Both are best-effort - a first-time
  // user simply has no profile row / no active plan yet, and the wizard
  // falls back to its normal empty state.
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: activePlans } = await supabase
    .from('diet_plans')
    .select('goal')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full py-12">
        <OnboardingForm
          foods={dbFoods || []}
          isNewPlanFlow={isNewPlanFlow}
          initialProfile={profile}
          initialGoal={activePlans?.[0]?.goal ?? null}
        />
      </div>
    </main>
  )
}
