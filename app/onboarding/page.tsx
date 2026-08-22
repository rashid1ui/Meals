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

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full py-12">
        <OnboardingForm foods={dbFoods || []} isNewPlanFlow={isNewPlanFlow} />
      </div>
    </main>
  )
}
