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
    // In production, this will surface the silent error in logs
  } else if (dbFoods) {
    // TEMPORARY DEVELOPMENT-SAFE DIAGNOSTICS
    const uniqueCategories = Array.from(new Set(dbFoods.map(f => f.category)))
    console.log(`[Diagnostic] DB Query Success. Rows returned: ${dbFoods.length}`)
    console.log(`[Diagnostic] Unique Categories returned:`, uniqueCategories)

    // Check how many match protein/dairy loosely
    const looseProteinCount = dbFoods.filter(f =>
      ['protein', 'dairy'].includes((f.category || '').toLowerCase().trim())
    ).length
    console.log(`[Diagnostic] Rows matching 'protein' or 'dairy' loosely: ${looseProteinCount}`)
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full py-12">
        <OnboardingForm foods={dbFoods || []} isNewPlanFlow={isNewPlanFlow} />
      </div>
    </main>
  )
}
