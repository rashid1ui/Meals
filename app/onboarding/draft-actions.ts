'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'

// Cross-device persistence for the IN-PROGRESS onboarding wizard only
// (app/onboarding/OnboardingForm.tsx). The wizard still writes localStorage
// first - that stays the instant, offline-safe, same-device resume path -
// and these actions keep an account-scoped copy in public.onboarding_drafts
// (migration 0025) so a second device can pick the same draft up. Every
// query is scoped to the authenticated user's own row; RLS enforces the
// same rule independently. The payload is stored and returned opaquely: its
// shape is OnboardingForm's concern (its OnboardingDraft interface), never
// interpreted here.

export interface ServerOnboardingDraft {
  draft: Record<string, unknown>
  updatedAt: string
}

export async function loadServerOnboardingDraft(): Promise<ServerOnboardingDraft | null> {
  const user = await getUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('onboarding_drafts')
    .select('draft, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data || !data.draft) return null
  return { draft: data.draft as Record<string, unknown>, updatedAt: data.updated_at as string }
}

export async function saveServerOnboardingDraft(
  draft: Record<string, unknown>
): Promise<{ ok: boolean }> {
  const user = await getUser()
  if (!user) return { ok: false }
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { ok: false }

  const supabase = await createClient()
  const { error } = await supabase
    .from('onboarding_drafts')
    .upsert(
      { user_id: user.id, draft, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) {
    // Best-effort: a failure here never blocks the wizard - localStorage
    // already covers same-device resume. Logged so a persistent failure
    // (e.g. migration 0025 not yet applied) is visible in server logs.
    console.error('[onboarding] failed to persist server draft:', error)
    return { ok: false }
  }
  return { ok: true }
}

export async function clearServerOnboardingDraft(): Promise<void> {
  const user = await getUser()
  if (!user) return

  const supabase = await createClient()
  const { error } = await supabase.from('onboarding_drafts').delete().eq('user_id', user.id)
  if (error) console.error('[onboarding] failed to clear server draft:', error)
}
