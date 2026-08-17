import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Configuration Error: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be defined in the environment.')
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with cross-browser cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Define protected routes that require a user
  const protectedRoutes = ['/dashboard', '/onboarding', '/settings']
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  )

  // Do not redirect API routes in middleware, API routes handle their own 401s
  if (request.nextUrl.pathname.startsWith('/api')) {
    return supabaseResponse
  }

  // Redirect unauthenticated users to login
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Handle authenticated routing logic based on actual DB state
  if (user) {
    const isLogin = request.nextUrl.pathname === '/login'
    const isDashboard = request.nextUrl.pathname.startsWith('/dashboard')
    const isOnboarding = request.nextUrl.pathname.startsWith('/onboarding')

    // If we are hitting a core routing page, verify the exact DB state to prevent loops
    if (isLogin || isDashboard || isOnboarding) {
      const { data: plans } = await supabase
        .from('diet_plans')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)

      const hasPlan = plans && plans.length > 0

      // Sync the cookie state just in case, though we now rely on DB for these core routes
      if (hasPlan) {
        supabaseResponse.cookies.set('gym_meals_onboarded', 'true', { path: '/', maxAge: 60 * 60 * 24 * 365 })
      } else {
        supabaseResponse.cookies.delete('gym_meals_onboarded')
      }

      if (isLogin) {
        const url = request.nextUrl.clone()
        url.pathname = hasPlan ? '/dashboard' : '/onboarding'
        const redirectRes = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectRes.cookies.set(cookie.name, cookie.value, cookie)
        })
        return redirectRes
      }

      if (isDashboard && !hasPlan) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        const redirectRes = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectRes.cookies.set(cookie.name, cookie.value, cookie)
        })
        return redirectRes
      }

      if (isOnboarding && hasPlan) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        const redirectRes = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectRes.cookies.set(cookie.name, cookie.value, cookie)
        })
        return redirectRes
      }
    }
  }

  return supabaseResponse
}
