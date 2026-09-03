import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      let isOnboarded = false
      if (user) {
        // Idempotent profile bootstrap, keyed on the auth user id (profiles.id
        // is the PK and a FK to auth.users.id). Upsert - not insert-and-ignore
        // - so the FIRST login on a new device still creates the row, and
        // every subsequent login on any device just refreshes the Google
        // contact fields (email/full_name/avatar_url) instead of erroring on
        // the duplicate key. Only these four columns are sent, so a conflict's
        // DO UPDATE never touches the biometric columns (sex/age/height_cm/
        // weight_kg/...) the user filled in during onboarding.
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: user.id,
              email: user.email || '',
              full_name: user.user_metadata?.full_name || null,
              avatar_url: user.user_metadata?.avatar_url || null,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
          )

        if (profileError) {
          console.error("Failed to initialize profile:", profileError)
        }
        // Check onboarding status by seeing if they have any diet plans (legacy logic)
        const { data: plans } = await supabase
          .from('diet_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1)
        isOnboarded = Boolean(plans && plans.length > 0)
      }

      const nextPath = isOnboarded ? '/dashboard' : '/onboarding'

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      let redirectUrl = ''
      if (isLocalEnv) {
        redirectUrl = `${origin}${nextPath}`
      } else if (forwardedHost) {
        redirectUrl = `https://${forwardedHost}${nextPath}`
      } else {
        redirectUrl = `${origin}${nextPath}`
      }

      const response = NextResponse.redirect(redirectUrl)

      // Set a secure cookie so middleware knows onboarding state without querying DB
      if (isOnboarded) {
        response.cookies.set('gym_meals_onboarded', 'true', {
          path: '/',
          secure: process.env.NODE_ENV !== 'development',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365 // 1 year
        })
      }

      return response
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=AuthCallbackFailed`)
}
