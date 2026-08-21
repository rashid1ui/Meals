import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function HomePage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  
  const { data: existingPlans } = await supabase
    .from('diet_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  if (existingPlans && existingPlans.length > 0) {
    // Ensure the middleware fast-path cookie is set. Setting cookies during
    // a Server Component render is only permitted when the framework is
    // already treating the response as dynamic; when it isn't, this throws.
    // Same defensive pattern as lib/supabase/server.ts's setAll - the
    // middleware (lib/supabase/middleware.ts) still refreshes this cookie
    // on the next request either way, so it's safe to ignore here.
    try {
      const cookieStore = await cookies()
      cookieStore.set('gym_meals_onboarded', 'true', {
        path: '/',
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365
      })
    } catch {
      // Cookies can only be modified in a Server Action or Route Handler.
      // Ignored - middleware refreshes this cookie on the next request.
    }
    redirect('/dashboard')
  } else {
    redirect('/onboarding')
  }
}
