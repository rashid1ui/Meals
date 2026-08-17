import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type GenerationLockResult = { ok: true } | { ok: false, error: string }

// Prevents duplicate diet generation for the same user (double-click, double
// tab, or a second regeneration request) using the 'profiles' table as a
// database-level lock, since Vercel serverless functions cannot share
// in-memory locks. Shared by both onboarding and meal-plan regeneration.
export async function acquireGenerationLock(supabase: SupabaseServerClient, userId: string): Promise<GenerationLockResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('updated_at')
    .eq('id', userId)
    .single()

  if (!profile) return { ok: false, error: 'Profile not found' }

  const newTimestamp = new Date().toISOString()
  const { data: lockData, error: lockError } = await supabase
    .from('profiles')
    .update({ updated_at: newTimestamp })
    .eq('id', userId)
    .eq('updated_at', profile.updated_at)
    .select('id')

  if (lockError || !lockData || lockData.length === 0) {
    // The updated_at timestamp changed since we read it. This proves a concurrent
    // request is already processing this user's onboarding/regeneration. Abort safely.
    return { ok: false, error: 'Your request is currently being processed. Please wait.' }
  }

  return { ok: true }
}
