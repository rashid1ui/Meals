import { getUser } from '@/lib/auth/get-user'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/ui/Header'
import OutsidePlanScanner from './OutsidePlanScanner'

// Dedicated route for the Outside-Plan Food Scanner (Phase 5). A wizard-style
// flow (upload -> analyzing -> review/edit -> confirm -> done) reads far
// better as its own page than a cramped modal, and it can be linked to and
// refreshed mid-review. Auth + Header match every other authenticated page
// (app/dashboard/insights/page.tsx).

export default async function OutsidePlanScanPage() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header
        userName={profile?.full_name || 'Athlete'}
        userEmail={user.email || ''}
        avatarUrl={profile?.avatar_url}
        avatarFallback={profile?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
      />

      <div className="max-w-3xl mx-auto p-6 mt-6 pb-20">
        <OutsidePlanScanner />
      </div>
    </main>
  )
}
