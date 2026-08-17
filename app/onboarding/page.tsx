import OnboardingForm from './OnboardingForm'
import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingPage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  const { data: dbFoods } = await supabase
    .from('food_database')
    .select('id, name, category')
    .eq('is_active', true)
    .order('name')

  return (
    <main className="min-h-screen bg-[#0B0E14] text-white font-['Outfit',sans-serif] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px] pointer-events-none" />
      
      <div className="w-full relative z-10 py-12">
        <OnboardingForm foods={dbFoods || []} />
      </div>
    </main>
  )
}
