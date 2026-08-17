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
    <main className="min-h-screen bg-[#0B0E14] text-white font-['Outfit',sans-serif] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="w-full relative z-10 py-12">
        <OnboardingForm foods={dbFoods || []} isNewPlanFlow={isNewPlanFlow} />
      </div>
    </main>
  )
}
