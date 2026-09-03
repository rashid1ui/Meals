import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decideAuthedRoute,
  resolveOAuthRedirectOrigin,
  shouldAbortCallback,
  AUTH_CALLBACK_ERROR
} from './routing'

// ---------------------------------------------------------------------------
// shouldAbortCallback - the failed-OAuth-callback decision.
//
// The route handler (app/auth/callback/route.ts) calls
// supabase.auth.signOut({ scope: 'local' }) and redirects to
// /login?error=AuthCallbackFailed whenever this returns true, so that a
// failed login can never leave a STALE session for a different account
// active in the browser (the cross-device identity bug). It proceeds
// normally only when this returns false.
// ---------------------------------------------------------------------------

test('shouldAbortCallback: failed code exchange -> abort (clear stale session)', () => {
  assert.equal(
    shouldAbortCallback({ hasCode: true, exchangeFailed: true, hasUser: false }),
    true
  )
  // even if a user object somehow lingers from a prior session
  assert.equal(
    shouldAbortCallback({ hasCode: true, exchangeFailed: true, hasUser: true }),
    true
  )
})

test('shouldAbortCallback: getUser() null after a "successful" exchange -> abort (clear stale session)', () => {
  assert.equal(
    shouldAbortCallback({ hasCode: true, exchangeFailed: false, hasUser: false }),
    true
  )
})

test('shouldAbortCallback: no ?code at all -> abort', () => {
  assert.equal(
    shouldAbortCallback({ hasCode: false, exchangeFailed: true, hasUser: false }),
    true
  )
})

test('shouldAbortCallback: code + exchange ok + real user -> proceed (successful login preserved)', () => {
  assert.equal(
    shouldAbortCallback({ hasCode: true, exchangeFailed: false, hasUser: true }),
    false
  )
})

test('AUTH_CALLBACK_ERROR is the stable query value the login page reads', () => {
  assert.equal(AUTH_CALLBACK_ERROR, 'AuthCallbackFailed')
})

// ---------------------------------------------------------------------------
// resolveOAuthRedirectOrigin - the canonical OAuth redirect origin.
//
// MUST be NEXT_PUBLIC_SITE_URL, never window.location.origin, so a login
// started on a Vercel preview / raw deployment URL still completes on the
// public production host (where the PKCE code-verifier cookie lives).
// window.location.origin is used ONLY as a last-resort fallback.
// ---------------------------------------------------------------------------

test('resolveOAuthRedirectOrigin: NEXT_PUBLIC_SITE_URL wins over the request host', () => {
  assert.equal(
    resolveOAuthRedirectOrigin(
      'https://gym-meals-six.vercel.app',
      'https://gym-meals-lyjar7aub-rashid1uis-projects.vercel.app'
    ),
    'https://gym-meals-six.vercel.app'
  )
})

test('resolveOAuthRedirectOrigin: same canonical origin no matter which host login starts on', () => {
  const site = 'https://app.example.com'
  for (const host of [
    'https://app.example.com',
    'https://deploy-abc123-team.vercel.app',
    'https://preview-xyz.vercel.app',
    'http://localhost:3000'
  ]) {
    assert.equal(resolveOAuthRedirectOrigin(site, host), site)
  }
})

test('resolveOAuthRedirectOrigin: trailing slashes are normalised', () => {
  assert.equal(
    resolveOAuthRedirectOrigin('https://app.example.com///', 'https://x'),
    'https://app.example.com'
  )
})

test('resolveOAuthRedirectOrigin: falls back to the request origin only when SITE_URL is missing/blank/invalid', () => {
  const fallback = 'https://fallback.example.com'
  assert.equal(resolveOAuthRedirectOrigin(undefined, fallback), fallback)
  assert.equal(resolveOAuthRedirectOrigin(null, fallback), fallback)
  assert.equal(resolveOAuthRedirectOrigin('', fallback), fallback)
  assert.equal(resolveOAuthRedirectOrigin('   ', fallback), fallback)
  assert.equal(resolveOAuthRedirectOrigin('not-a-url', fallback), fallback)
  assert.equal(resolveOAuthRedirectOrigin('example.com', fallback), fallback)
  assert.equal(resolveOAuthRedirectOrigin(undefined, 'https://fallback.example.com/'), fallback)
})

// ---------------------------------------------------------------------------
// decideAuthedRoute - the post-login routing decision for an authenticated
// user. Only inputs: requested path, whether the CURRENT user has an active
// diet plan (an RLS-scoped auth.uid() = user_id fact), and ?newPlan=true.
// ---------------------------------------------------------------------------

test('State A / B - new user or incomplete onboarding (no active plan) -> /onboarding', () => {
  assert.equal(decideAuthedRoute('/', false, false), '/onboarding')
  assert.equal(decideAuthedRoute('/login', false, false), '/onboarding')
  assert.equal(decideAuthedRoute('/dashboard', false, false), '/onboarding')
  // already on onboarding: stay put
  assert.equal(decideAuthedRoute('/onboarding', false, false), null)
})

test('State C - onboarding complete + active plan -> /dashboard', () => {
  assert.equal(decideAuthedRoute('/', true, false), '/dashboard')
  assert.equal(decideAuthedRoute('/login', true, false), '/dashboard')
  assert.equal(decideAuthedRoute('/onboarding', true, false), '/dashboard')
  // already on dashboard: stay put
  assert.equal(decideAuthedRoute('/dashboard', true, false), null)
})

test('State D - onboarding complete but NO active plan -> /onboarding (existing plan-creation screen, no new flow)', () => {
  // identical to State A: the dashboard cannot render without a plan
  assert.equal(decideAuthedRoute('/', false, false), '/onboarding')
  assert.equal(decideAuthedRoute('/dashboard', false, false), '/onboarding')
})

test('Same account on a second device -> /dashboard (decision has NO device/browser/cookie input)', () => {
  // The only lever is hasActivePlan. A user with a plan lands on the
  // dashboard from any entry point, on any device.
  assert.equal(decideAuthedRoute('/', true, false), '/dashboard')
  assert.equal(decideAuthedRoute('/login', true, false), '/dashboard')
  assert.equal(decideAuthedRoute('/onboarding', true, false), '/dashboard')
  // decideAuthedRoute's arity is exactly (pathname, hasActivePlan, isNewPlanRequest)
  assert.equal(decideAuthedRoute.length, 3)
})

test('?newPlan=true - an authed user with a plan may stay on /onboarding to build a new one', () => {
  assert.equal(decideAuthedRoute('/onboarding', true, true), null)
  // but only /onboarding honours it; / and /login still route home
  assert.equal(decideAuthedRoute('/', true, true), '/dashboard')
  assert.equal(decideAuthedRoute('/login', true, true), '/dashboard')
})

test('dashboard/onboarding sub-paths follow their parent', () => {
  assert.equal(decideAuthedRoute('/dashboard/insights', false, false), '/onboarding')
  assert.equal(decideAuthedRoute('/dashboard/plans/abc', true, false), null)
  assert.equal(decideAuthedRoute('/onboarding/anything', true, false), '/dashboard')
})

test('non-core paths are never redirected by this decision', () => {
  for (const p of ['/settings', '/privacy', '/terms', '/api/health', '/design-system', '/random']) {
    assert.equal(decideAuthedRoute(p, true, false), null)
    assert.equal(decideAuthedRoute(p, false, false), null)
  }
})

test('no redirect loops - every (path, hasPlan, isNew) reaches a fixed point in <= 1 hop', () => {
  const paths = ['/', '/login', '/dashboard', '/dashboard/insights', '/onboarding', '/onboarding/x', '/settings']
  for (const hasPlan of [true, false]) {
    for (const isNew of [true, false]) {
      for (const start of paths) {
        const first = decideAuthedRoute(start, hasPlan, isNew)
        if (first === null) continue
        assert.notEqual(first, start, `${start} (plan=${hasPlan}) redirected to itself`)
        // Landing on the destination must be stable (no further redirect).
        const second = decideAuthedRoute(first, hasPlan, isNew)
        assert.equal(
          second,
          null,
          `loop: ${start} -> ${first} -> ${second} (plan=${hasPlan}, newPlan=${isNew})`
        )
      }
    }
  }
})

test('user isolation - the decision is a pure function of THIS user\'s plan flag', () => {
  // Same path + same newPlan, flip only hasActivePlan: the outcome changes
  // deterministically. Nothing else (no other user, no ambient state) can
  // influence it - there is no other input to influence.
  for (const path of ['/', '/login', '/dashboard', '/onboarding']) {
    const withPlan = decideAuthedRoute(path, true, false)
    const withoutPlan = decideAuthedRoute(path, false, false)
    assert.notEqual(withPlan, withoutPlan, `plan flag must change routing for ${path}`)
    // determinism across repeated calls
    assert.equal(decideAuthedRoute(path, true, false), withPlan)
    assert.equal(decideAuthedRoute(path, false, false), withoutPlan)
  }
})
