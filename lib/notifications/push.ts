import 'server-only'

// The only place web-push is invoked from - the actual "deliver while the
// browser/tab is closed" step. Everything upstream of this (schedule.ts,
// milestones.ts, copy.ts, admin.ts) stays exactly as it was designed in
// Phase 1: transport-agnostic. This file is that transport.

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyPushError } from './pushErrors'
import { validateVapidConfig, type VapidConfigValidation } from './vapid'

let configured = false

function readVapidConfigFromEnv() {
  return {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    email: process.env.VAPID_EMAIL
  }
}

// Exported so callers that need to fail closed BEFORE doing any per-user
// work (app/api/cron/notifications/route.ts's up-front check) can detect a
// malformed key pair once, with a specific and actionable message, instead
// of letting ensureVapidConfigured's throw surface deep inside the first
// user's send - which previously crashed the ENTIRE sweep with a generic
// "Vapid public key should be 65 bytes long when decoded" for every user on
// every affected tick (the real production incident this module now guards
// against).
export function checkVapidConfig(): VapidConfigValidation {
  return validateVapidConfig(readVapidConfigFromEnv())
}

// Lazy, not module-top-level: throwing at import time would break every
// route that merely imports this file (even ones that never send a push),
// including during `next build`'s static analysis pass.
function ensureVapidConfigured() {
  if (configured) return

  const validation = checkVapidConfig()
  if (!validation.valid) {
    throw new Error(
      `VAPID configuration is invalid, push notifications cannot be sent: ${validation.errors.join('; ')}. Regenerate a keypair with \`npx web-push generate-vapid-keys\` and set NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_EMAIL in the environment.`
    )
  }

  const { publicKey, privateKey, email } = readVapidConfigFromEnv()
  webpush.setVapidDetails(`mailto:${email}`, publicKey!, privateKey!)
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
        const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('id', row.id)
        if (deleteError) {
          console.error(`[notifications/push] failed to remove dead subscription ${row.id}:`, deleteError)
        } else {
          removed++
        }
      } else {
        console.error(`[notifications/push] send failed for subscription ${row.id}:`, err)
      }
    }
  }

  return { sent, removed }
}
