import type { Metadata } from 'next'
import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import LandingPage from './marketing/LandingPage'
import { decideAuthedRoute } from '@/lib/auth/routing'

export const metadata: Metadata = {
  title: 'Gym Meals — Build Your Diet. Track Your Progress.',
  description:
    'Gym Meals gives you the tools to build, customize, and track a nutrition plan that fits your goals, food preferences, training, and lifestyle. Manual meal planning, personalized targets, and nutrition insights — free to start.',
  keywords: [
    'meal planning',
    'nutrition tracking',
    'macro tracker',
    'calorie targets',
    'workout nutrition',
    'supplement tracking',
    'diet plan builder'
  ],
  alternates: {
    canonical: '/'
  },
  openGraph: {
    title: 'Gym Meals — Build Your Diet. Track Your Progress.',
    description:
      'A flexible nutrition planning and tracking system that gives you control over every meal while keeping your calorie and macro targets in view.',
    url: '/',
    siteName: 'Gym Meals',
    type: 'website'
  },
  twitter: {
    card: 'summary',
    title: 'Gym Meals — Build Your Diet. Track Your Progress.',
    description:
      'A flexible nutrition planning and tracking system that gives you control over every meal while keeping your calorie and macro targets in view.'
  }
}

export default async function HomePage() {
  const user = await getUser()

  // Logged-out visitors land on the marketing page instead of being bounced
  // straight to /login - everything below this (existing plan lookup,
  // cookie fast-path, dashboard/onboarding redirect) is unchanged for an
  // authenticated user.
  if (!user) {
    return <LandingPage />
  }

  const supabase = await createClient()
  
  const { data: existingPlans } = await supabase
    .from('diet_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const hasActivePlan = Boolean(existingPlans && existingPlans.length > 0)

  // Same routing decision as middleware (lib/auth/routing.ts) - one
  // definition, account-scoped, never device state. For '/' this always
  // resolves to '/dashboard' or '/onboarding'.
  const dest = decideAuthedRoute('/', hasActivePlan, false) ?? '/onboarding'

  if (dest === '/dashboard') {
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
  }

  redirect(dest)
}
