// Single source of truth for the dedicated QA/E2E test account. Every QA
// tool (currently just scripts/qa-reset.ts) imports this instead of
// hardcoding the email/UUID a second time anywhere.
//
// Deliberately NOT `import 'server-only'`: scripts/qa-reset.ts is a plain
// Node/tsx script outside the Next.js server bundle graph (the thing
// `server-only` protects against), and that marker throws immediately when
// imported outside a React Server Components build - it would break the
// only caller this module has. This module holds no secret itself (it only
// reads two env VAR NAMES via process.env), so there is nothing to protect
// against a script importing it.
//
// SAFETY MODEL (see the design discussion this implements):
//   - Fails CLOSED: both env vars must be set, or every QA operation refuses
//     to run - same "no configured secret, no operation" pattern as
//     CRON_SECRET (app/api/cron/notifications/route.ts).
//   - No override: there is deliberately NO parameter/argument anywhere in
//     this module (or its callers) that accepts a caller-supplied email or
//     user id. The identity is fixed at the environment-configuration
//     level, never at the call site - a QA tool structurally cannot be
//     pointed at an arbitrary account.
//   - Double-verified at the call site: assertIsQaIdentity re-checks BOTH
//     the id AND the email against a freshly-read row before any
//     destructive operation proceeds (see scripts/qa-reset.ts) - a stale
//     UUID, a changed email, or a wrong project all abort loudly instead of
//     silently doing nothing (or worse, something).
//   - `auth.users` is never referenced here or by any caller - the QA
//     identity is resolved once via the ordinary `profiles` table (id,
//     email), never by touching Supabase auth tables directly.

export type QaIdentity = {
  email: string
  userId: string
}

// Throws with a clear, actionable message when either var is missing -
// never silently returns a partial/undefined identity.
export function requireQaIdentity(): QaIdentity {
  const email = process.env.QA_ACCOUNT_EMAIL?.trim()
  const userId = process.env.QA_ACCOUNT_USER_ID?.trim()

  if (!email || !userId) {
    throw new Error(
      'QA_ACCOUNT_EMAIL and QA_ACCOUNT_USER_ID must both be set in the environment - see .env.example. ' +
        'No default/fallback identity exists on purpose: a QA operation must never run against an ' +
        'unconfigured or ambiguous target.'
    )
  }

  return { email: email.toLowerCase(), userId }
}

// Re-verifies a freshly-loaded profile row against the configured identity.
// Call this immediately before any destructive/mutating QA operation -
// never trust that a previous check still holds.
export function assertIsQaIdentity(
  identity: QaIdentity,
  candidate: { id: string; email: string | null }
): void {
  const candidateEmail = (candidate.email ?? '').trim().toLowerCase()
  if (candidate.id !== identity.userId || candidateEmail !== identity.email) {
    throw new Error(
      `QA operation blocked: resolved account (id=${candidate.id}, email=${candidate.email ?? 'null'}) ` +
        `does not match the configured QA identity (id=${identity.userId}, email=${identity.email}). Aborting.`
    )
  }
}
