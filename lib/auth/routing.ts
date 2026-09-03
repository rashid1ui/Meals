// Canonical, testable helpers for the post-login flow. These are pure
// functions with no Supabase / Next imports so the routing decision, the
// OAuth redirect origin, and the failed-callback decision can be exercised
// directly in `npm test` (no live DB, no browser). The real code paths
// (lib/supabase/middleware.ts, app/page.tsx, app/login/page.tsx,
// app/auth/callback/route.ts) call these - there is exactly ONE definition
// of each.

const DASHBOARD = '/dashboard'
const ONBOARDING = '/onboarding'

/**
 * The post-login routing decision for an ALREADY-AUTHENTICATED user.
 *
 * The only inputs are the requested path, whether the CURRENT user has an
 * active diet plan (a server-side, RLS-scoped `auth.uid() = user_id` fact -
 * never anything device-local), and whether this is an explicit
 * "start a new plan" navigation (`?newPlan=true`). Returns the path to
 * redirect to, or `null` to stay on the current page.
 *
 * State matrix (all require Authenticated = yes):
 *   A New user / B incomplete onboarding  -> no active plan  -> /onboarding
 *   C onboarding complete + active plan    -> active plan     -> /dashboard
 *   D onboarding complete + no active plan -> no active plan  -> /onboarding
 *     (the existing plan-creation screen; the dashboard cannot render
 *      without a plan - app/dashboard/page.tsx redirects there anyway)
 *
 * Same-account-on-a-second-device is not a distinct case: it is State C
 * (hasActivePlan = true -> /dashboard) and nothing here depends on the
 * device, browser, cookies, or any prior session.
 */
export function decideAuthedRoute(
  pathname: string,
  hasActivePlan: boolean,
  isNewPlanRequest: boolean
): string | null {
  const isRoot = pathname === '/'
  const isLogin = pathname === '/login'
  const isDashboard = pathname === DASHBOARD || pathname.startsWith(DASHBOARD + '/')
  const isOnboarding = pathname === ONBOARDING || pathname.startsWith(ONBOARDING + '/')

  // The app only makes an authed-routing decision on these entry points.
  if (!(isRoot || isLogin || isDashboard || isOnboarding)) return null

  // From an entry point (/, /login) send the user to their home surface.
  if (isRoot || isLogin) return hasActivePlan ? DASHBOARD : ONBOARDING

  // On /dashboard with no plan there is nothing to show -> onboarding.
  if (isDashboard) return hasActivePlan ? null : ONBOARDING

  // On /onboarding with a plan, bounce to the dashboard - UNLESS the user
  // explicitly asked to build a new plan (Settings -> /onboarding?newPlan=true).
  if (isOnboarding) return hasActivePlan && !isNewPlanRequest ? DASHBOARD : null

  return null
}

/**
 * The origin to use for the Google OAuth `redirectTo`. MUST be a fixed
 * canonical site URL, never `window.location.origin`: if the user opened the
 * app from a Vercel preview / raw deployment URL (which is SSO-gated), an
 * origin-derived callback lands on that gated host, the PKCE code-verifier
 * cookie is unavailable there, `exchangeCodeForSession` fails, and the login
 * silently no-ops. Pinning the origin makes every login complete on the
 * public production host.
 *
 * `siteUrl` is `process.env.NEXT_PUBLIC_SITE_URL`. `fallbackOrigin` (a
 * last-resort `window.location.origin`) is used only when it is not set.
 */
export function resolveOAuthRedirectOrigin(
  siteUrl: string | undefined | null,
  fallbackOrigin: string
): string {
  const cleaned = (siteUrl ?? '').trim().replace(/\/+$/, '')
  if (/^https?:\/\/[^/]+/i.test(cleaned)) return cleaned
  return fallbackOrigin.replace(/\/+$/, '')
}

/**
 * Whether the OAuth callback must ABORT - clear any existing Supabase
 * session in this browser and bounce to /login with a visible error -
 * instead of proceeding. A failed exchange, or an exchange that did not
 * yield a verifiable user, must never leave a STALE session for a different
 * account active: middleware would then resolve that old session and the
 * user would silently keep operating as whoever was signed in before.
 */
export function shouldAbortCallback(input: {
  hasCode: boolean
  exchangeFailed: boolean
  hasUser: boolean
}): boolean {
  return !input.hasCode || input.exchangeFailed || !input.hasUser
}

export const AUTH_CALLBACK_ERROR = 'AuthCallbackFailed'
