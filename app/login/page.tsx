'use client'

// /login - the sign-in screen. This file is a VISUAL redesign only: the
// split-screen editorial layout, shared food photography (LOGIN_IMAGE from
// the marketing image set), and typography are brought in line with the
// landing page so the two read as one product. The authentication path is
// untouched - still a single "Continue with Google" that calls
// supabase.auth.signInWithOAuth and redirects to /auth/callback.
//
// Build note: this comment exists only to change this module's source hash
// so a Vercel production build recompiles it instead of reusing a cached
// chunk - needed so NEXT_PUBLIC_SITE_URL (read below for the OAuth
// redirectTo) gets inlined. No behavior change.
import { createClient } from '@/lib/supabase/client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { AlertIcon } from '@/components/ui/icons'
import { LOGIN_IMAGE } from '@/app/marketing/images'
import { resolveOAuthRedirectOrigin, AUTH_CALLBACK_ERROR } from '@/lib/auth/routing'

function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // Surface a failed OAuth callback instead of swallowing it. The callback
  // route (app/auth/callback/route.ts) redirects here with
  // ?error=AuthCallbackFailed AFTER it has signed the stale session out, so
  // the user sees why they're back on the login screen. Derived during
  // render from the URL (no effect, no setState-in-effect); an error raised
  // by the sign-in button itself takes precedence.
  const searchParams = useSearchParams()
  const callbackErrorCode = searchParams.get('error')
  const callbackError =
    callbackErrorCode === AUTH_CALLBACK_ERROR
      ? 'We could not complete your sign-in. Please try again. If this keeps happening, make sure you are opening the app from its main web address, not a preview or deployment link.'
      : callbackErrorCode
        ? 'Sign-in was interrupted. Please try again.'
        : null
  const error = oauthError ?? callbackError

  const setError = setOauthError

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()

      // Pin the OAuth redirect to the canonical site origin
      // (NEXT_PUBLIC_SITE_URL), never window.location.origin. If the user
      // opened the app from a Vercel preview / raw deployment URL (SSO-gated,
      // different host), an origin-derived callback lands there, the PKCE
      // code-verifier cookie is unavailable, exchangeCodeForSession fails and
      // the login silently no-ops. Falls back to window.location.origin only
      // when NEXT_PUBLIC_SITE_URL is not configured.
      const redirectOrigin = resolveOAuthRedirectOrigin(
        process.env.NEXT_PUBLIC_SITE_URL,
        window.location.origin
      )

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${redirectOrigin}/auth/callback`,
          // Always show Google's account picker. Without this, Google
          // silently reuses whichever account is already active in the
          // browser - so the same person on a phone and a Mac can end up
          // authenticated as two different Google accounts (two different
          // Supabase Auth users) without ever realizing it, which then
          // looks like "my account is empty on this device". Forcing the
          // chooser makes the account being used explicit on every login.
          queryParams: { prompt: 'select_account' },
        },
      })

      if (error) {
        setError(error.message)
      }
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Food visual - a full-height editorial panel on desktop, an
          optimized top band on mobile. Decorative: it supports the brand
          without carrying information the auth flow needs, so the heading
          below is the real page landmark. */}
      <div className="relative h-56 sm:h-72 lg:h-auto overflow-hidden">
        <Image
          src={LOGIN_IMAGE.src}
          alt={LOGIN_IMAGE.alt}
          fill
          preload
          sizes="(min-width: 1024px) 52vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/10 lg:bg-gradient-to-br lg:from-black/50 lg:via-black/15 lg:to-transparent" />
        <div className="hidden lg:block absolute bottom-12 left-12 right-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
              GM
            </span>
            <span className="font-display font-semibold text-lg tracking-tight text-white">Gym Meals</span>
          </Link>
          <p className="mt-5 max-w-sm font-display font-medium text-2xl leading-snug tracking-[-0.01em] text-white text-balance">
            Build your diet, track your progress, stay on target.
          </p>
        </div>
      </div>

      {/* Sign-in card */}
      <div className="flex flex-col items-center justify-center px-5 sm:px-8 py-12 lg:py-16">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="lg:hidden inline-flex items-center gap-2 mb-9 rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
              GM
            </span>
            <span className="font-display font-semibold text-lg tracking-tight text-foreground">Gym Meals</span>
          </Link>

          <h1 className="font-display font-medium text-3xl sm:text-4xl tracking-[-0.02em] text-foreground text-balance">
            Welcome to Gym Meals
          </h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Sign in to sync your nutrition plan and progress across devices.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-control"
            >
              <AlertIcon size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button
            variant="secondary"
            onClick={handleGoogleLogin}
            loading={loading}
            className="mt-8 w-full text-[15px]"
          >
            {!loading && (
              <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
            )}
            {loading ? 'Connecting...' : 'Continue with Google'}
          </Button>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to our{' '}
            <Link href="/terms" className="underline decoration-border underline-offset-2 hover:text-foreground">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline decoration-border underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>

          <Link
            href="/"
            className="mt-10 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-pill"
          >
            <span aria-hidden="true">&larr;</span> Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}

// useSearchParams() must sit under a Suspense boundary so /login can still
// be prerendered (the search-param-dependent part suspends on the server
// and resolves on the client).
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
