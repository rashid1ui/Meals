import 'server-only'

// The only place web-push is invoked from - the actual "deliver while the
// browser/tab is closed" step. Everything upstream of this (schedule.ts,
// milestones.ts, copy.ts, admin.ts) stays exactly as it was designed in
// Phase 1: transport-agnostic. This file is that transport.

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyPushError } from './pushErrors'

let configured = false

// Lazy, not module-top-level: throwing at import time would break every
// route that merely imports this file (even ones that never send a push),
// including during `next build`'s static analysis pass.
function ensureVapidConfigured() {
  if (configured) return

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL

  if (!publicKey || !privateKey || !email) {
    throw new Error(
      'Configuration Error: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL must be defined in the environment. Generate a keypair with `npx web-push generate-vapid-keys`.'
    )
  }

  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth_key: string
}

export interface SendPushResult {
  sent: number
  removed: number
}

// Sends to EVERY device the user has subscribed - multiple devices per user
// is normal, each is its own push_subscriptions row keyed by its endpoint.
// A subscription the push service reports as permanently gone (410 Gone or
// 404 Not Found - the browser/OS uninstalled or expired it) is deleted here
// rather than retried, since it can never succeed again; any other error
// (e.g. a transient network failure) is logged and left in place so the
// next scheduled send can retry it naturally.
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<SendPushResult> {
  ensureVapidConfigured()

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userId)

  if (error) {
    console.error('[notifications/push] failed to load subscriptions:', error)
    return { sent: 0, removed: 0 }
  }

  const rows = (subscriptions as SubscriptionRow[] | null) || []
  let sent = 0
  let removed = 0

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
        JSON.stringify(payload)
      )
      sent++
    } catch (err) {
      if (classifyPushError(err) === 'remove') {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
        removed++
      } else {
        console.error(`[notifications/push] send failed for subscription ${row.id}:`, err)
      }
    }
  }

  return { sent, removed }
}
