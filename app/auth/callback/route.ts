import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { shouldAbortCallback, AUTH_CALLBACK_ERROR } from '@/lib/auth/routing'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Canonical base URL for every redirect out of this route (success OR
  // failure). On Vercel `origin` can be an internal host, so prefer the
  // forwarded host in production - same rule the success path already used.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseUrl = isLocalEnv
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin

  const supabase = await createClient()

  // Abort path: a failed OAuth callback must NEVER leave a stale session for
  // a different account active in this browser. Without the signOut below,
  // middleware resolves whatever session was already in the cookies and the
  // user silently keeps operating as whoever was signed in before this
  // (failed) login - the exact cross-device identity bug this fixes.
  // scope:'local' clears only THIS browser's Supabase cookies; it makes no
  // network call and does not revoke that account's sessions on its own
  // devices.
  const abortToLogin = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Best-effort - the redirect below still clears the user out of the app.
    }
    return NextResponse.redirect(`${baseUrl}/login?error=${AUTH_CALLBACK_ERROR}`)
  }

  let exchangeFailed = !code
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    exchangeFailed = Boolean(error)
  }

  // Re-verify the exchange actually produced a usable user. getUser() hits
  // the auth server, so a null here means the session isn't real even if
  // exchangeCodeForSession reported no error.
  let user: User | null = null
  if (!exchangeFailed) {
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  if (shouldAbortCallback({ hasCode: Boolean(code), exchangeFailed, hasUser: Boolean(user) })) {
    return abortToLogin()
  }

  // --- Successful callback (unchanged behavior) ---

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
        id: user!.id,
        email: user!.email || '',
        full_name: user!.user_metadata?.full_name || null,
        avatar_url: user!.user_metadata?.avatar_url || null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    console.error('Failed to initialize profile:', profileError)
  }

  // Check onboarding status by seeing if they have any active diet plan.
  const { data: plans } = await supabase
    .from('diet_plans')
    .select('id')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .limit(1)
  const isOnboarded = Boolean(plans && plans.length > 0)

  const nextPath = isOnboarded ? '/dashboard' : '/onboarding'
  const response = NextResponse.redirect(`${baseUrl}${nextPath}`)

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
