import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ManualPlanLockResult = { ok: true } | { ok: false; error: string }

// Dedicated lock for createManualDietPlan (app/onboarding/manual-actions.ts)
// - deliberately a SEPARATE column/module from
// lib/diet/generation-lock.ts's generation_lock_at, not a reuse of it. The
// AI lock's long 90s TTL is sized around a ~50s AI call
// (ACTION_TIMEOUT_MS) that manual plan creation never makes; sharing that
// column would mean a stuck/slow AI generation could block a user's manual
// plan creation (or vice versa) for up to 90s for no reason connecting the
// two paths. Manual plan creation is a handful of fast, synchronous DB
// writes, so this TTL only needs to comfortably exceed THAT window.
export const MANUAL_PLAN_LOCK_TTL_MS = 20_000

/** Pure - true when a lock timestamp is missing, unparseable, or older than
 * ttlMs. Exported separately so the staleness rule itself is unit-testable
 * without a Supabase client - mirrors generation-lock.ts's isLockStale. */
export function isManualPlanLockStale(
  lockAt: string | null | undefined,
  now: number,
  ttlMs: number = MANUAL_PLAN_LOCK_TTL_MS
): boolean {
  if (!lockAt) return true
  const lockTime = new Date(lockAt).getTime()
  if (Number.isNaN(lockTime)) return true
  return now - lockTime > ttlMs
}

// Prevents duplicate manual plan creation for the same user (a rapid
// double-click on "Create Plan", two open tabs, or a retried request racing
// its own earlier attempt) using the 'profiles' table as a database-level
// lock, exactly like generation-lock.ts's compare-and-swap approach - but
// against manual_plan_lock_at, a column this module owns exclusively.
export async function acquireManualPlanLock(supabase: SupabaseServerClient, userId: string): Promise<ManualPlanLockResult> {
  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('manual_plan_lock_at')
    .eq('id', userId)
    .single()

  if (readError || !profile) {
    console.error('[manual-plan-lock] failed to read lock state for user', userId, readError)
    return { ok: false, error: 'Profile not found' }
  }

  const now = Date.now()
  if (!isManualPlanLockStale(profile.manual_plan_lock_at, now)) {
    return { ok: false, error: 'Your request is already being processed. Please wait a moment and check your dashboard.' }
  }

  const newTimestamp = new Date(now).toISOString()
  let updateQuery = supabase.from('profiles').update({ manual_plan_lock_at: newTimestamp }).eq('id', userId)
  // Optimistic compare-and-swap against whatever we just read - .eq() with a
  // JS `null` value does not reliably translate to `IS NULL` in PostgREST, so
  // the no-existing-lock case is handled explicitly with .is().
  updateQuery =
    profile.manual_plan_lock_at == null
      ? updateQuery.is('manual_plan_lock_at', null)
      : updateQuery.eq('manual_plan_lock_at', profile.manual_plan_lock_at)

  const { data: lockData, error: lockError } = await updateQuery.select('id')

  if (lockError || !lockData || lockData.length === 0) {
    // Someone else's acquire won the race between our read and this write.
    return { ok: false, error: 'Your request is already being processed. Please wait a moment and check your dashboard.' }
  }

  return { ok: true }
}

// Best-effort: a failed release is not fatal to the request that already
// completed (successfully or not) - the TTL above guarantees the lock is
// reclaimable regardless. Logged, never thrown, so it can be safely awaited
// from a `finally` block without risking masking the real result/error.
export async function releaseManualPlanLock(supabase: SupabaseServerClient, userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ manual_plan_lock_at: null }).eq('id', userId)
  if (error) {
    console.error('[manual-plan-lock] failed to release manual plan lock for user', userId, error)
  }
}
