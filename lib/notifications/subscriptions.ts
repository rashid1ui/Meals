// Pure validation for a browser PushSubscription payload - no Supabase, no
// 'use client'/'use server'. Mirrors lib/diet/save-plan.ts's split (pure
// shape-validation extracted from the 'use server' action that persists it)
// so this one rule is unit-testable without a database.

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export function isValidPushSubscriptionInput(value: unknown): value is PushSubscriptionInput {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.endpoint !== 'string' || v.endpoint.length === 0) return false

  const keys = v.keys as Record<string, unknown> | undefined
  return Boolean(
    keys && typeof keys.p256dh === 'string' && keys.p256dh.length > 0 && typeof keys.auth === 'string' && keys.auth.length > 0
  )
}
