import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/SignOutButton'
import Avatar from '@/components/Avatar'
import Link from 'next/link'
import GenerateNewPlanButton from './GenerateNewPlanButton'

export default async function SettingsPage() {
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

  return (
    <main className="min-h-screen bg-[#0B0E14] text-white font-['Outfit',sans-serif]">
      {/* Top Navigation */}
      <nav className="w-full bg-[#161B22] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold">
            GM
          </div>
          <span className="font-bold text-xl tracking-tight">Gym Meals</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold">{profile?.full_name || 'Athlete'}</div>
            <div className="text-xs text-gray-400">{user.email}</div>
          </div>
          <Avatar
            src={profile?.avatar_url}
            alt="Avatar"
            fallbackText={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
          />
          <div className="ml-2 pl-4 border-l border-gray-700">
            <SignOutButton />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-6 mt-6 space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
          >
            &larr; Back to Dashboard
          </Link>
        </div>

        {/* Meal Plan Section */}
        <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl">
          <h2 className="text-xl font-bold tracking-tight">Meal Plan</h2>
          <p className="text-gray-400 mt-1 mb-6">
            Start over with new nutrition targets and food preferences.
          </p>
          <GenerateNewPlanButton />
        </div>
      </div>
    </main>
  )
}
