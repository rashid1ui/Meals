import 'server-only'

// Fire-and-forget image resolution, scheduled to run AFTER the response is
// sent (Next.js `after()`), so creating a food / supplement / meal is never
// slowed or blocked by a Pexels / Open Food Facts round-trip. Every failure
// is swallowed and logged - a create must always succeed even if no image
// is found.
//
// The reconciliation sweep (/api/cron/images) is the safety net: anything
// this misses (a killed serverless invocation, a transient API error, a row
// created by a path that didn't call this) is retried there.

import { after } from 'next/server'
import { resolveAndPersist, type ResolveTarget } from './runResolve'
import { createAdminClient } from '@/lib/supabase/admin'

async function run(target: ResolveTarget): Promise<void> {
  try {
    await resolveAndPersist(createAdminClient(), target)
  } catch (err) {
    console.error(`[images/schedule] ${target.kind} ${target.id} failed:`, err instanceof Error ? err.message : err)
  }
}

// Schedule resolution for one newly-created entity. Uses `after()` when in a
// request context; falls back to a detached promise otherwise (e.g. a
// script) so the call site never has to care.
export function scheduleImageResolution(target: ResolveTarget): void {
  try {
    after(() => run(target))
  } catch {
    void run(target)
  }
}

// Batch helper for plan creation - schedules one resolution per meal id.
export function scheduleMealImageResolution(mealIds: readonly string[]): void {
  for (const id of mealIds) scheduleImageResolution({ kind: 'meal', id })
}
