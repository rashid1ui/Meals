import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Check onboarding status by seeing if they have any diet plans (legacy logic)
      const { data: plans } = await supabase.from('diet_plans').select('id').limit(1)
      const isOnboarded = plans && plans.length > 0
      
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
