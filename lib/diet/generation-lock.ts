import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type GenerationLockResult = { ok: true } | { ok: false, error: string }

// Generation (lib/diet/generate-diet.ts's ACTION_TIMEOUT_MS) can run for up to
// 50s, plus the DB writes that follow it in app/onboarding/actions.ts. This
// TTL must comfortably exceed that whole window so a crashed/killed request
// (a Vercel function timeout, an uncaught exception before the release path
// runs) can never permanently lock a user out of generating a plan again -
// the lock simply expires and becomes acquirable once this much time has
// passed, even if it was never explicitly released.
export const GENERATION_LOCK_TTL_MS = 90_000

/** Pure - true when a lock timestamp is missing, unparseable, or older than
 * ttlMs. Exported separately from acquireGenerationLock so the staleness
 * rule itself is unit-testable without a Supabase client. */
export function isLockStale(lockAt: string | null | undefined, now: number, ttlMs: number = GENERATION_LOCK_TTL_MS): boolean {
  if (!lockAt) return true
  const lockTime = new Date(lockAt).getTime()
  if (Number.isNaN(lockTime)) return true
  return now - lockTime > ttlMs
}

// Prevents duplicate diet generation for the same user (double-click, double
// tab, or a second regeneration request) using the 'profiles' table as a
// database-level lock, since Vercel serverless functions cannot share
// in-memory locks. Shared by both onboarding and meal-plan regeneration.
//
// Unlike a plain "compare updated_at, then bump it" check (the previous
// implementation), this holds the lock for the FULL generation window: a
// dedicated generation_lock_at column is set here and only cleared by
// releaseGenerationLock once generation (success or failure) has finished -
// see app/onboarding/actions.ts's try/finally. The previous approach only
// protected the single instant between reading and writing updated_at; a
// second request arriving a moment later (while the first request's ~50s AI
// call was still in flight) could read the already-bumped timestamp as its
// own baseline and acquire "the lock" a second time.
export async function acquireGenerationLock(supabase: SupabaseServerClient, userId: string): Promise<GenerationLockResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('generation_lock_at')
    .eq('id', userId)
    .single()

  if (!profile) return { ok: false, error: 'Profile not found' }

  const now = Date.now()
  if (!isLockStale(profile.generation_lock_at, now)) {
    return { ok: false, error: 'Your request is currently being processed. Please wait.' }
  }

  const newTimestamp = new Date(now).toISOString()
  let updateQuery = supabase.from('profiles').update({ generation_lock_at: newTimestamp }).eq('id', userId)
  // Optimistic compare-and-swap against whatever we just read - .eq() with a
  // JS `null` value does not reliably translate to `IS NULL` in PostgREST, so
  // the no-existing-lock case is handled explicitly with .is().
  updateQuery =
    profile.generation_lock_at == null
      ? updateQuery.is('generation_lock_at', null)
      : updateQuery.eq('generation_lock_at', profile.generation_lock_at)

  const { data: lockData, error: lockError } = await updateQuery.select('id')

  if (lockError || !lockData || lockData.length === 0) {
    // Someone else's acquire won the race between our read and this write.
    return { ok: false, error: 'Your request is currently being processed. Please wait.' }
  }

  return { ok: true }
}

// Best-effort: a failed release is not fatal to the request that already
// completed (successfully or not) - the TTL above guarantees the lock is
// reclaimable regardless. Logged, never thrown, so it can be safely awaited
// from a `finally` block without risking masking the real result/error.
export async function releaseGenerationLock(supabase: SupabaseServerClient, userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ generation_lock_at: null }).eq('id', userId)
  if (error) {
    console.error('[generation-lock] failed to release generation lock for user', userId, error)
  }
}
