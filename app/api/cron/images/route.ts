// Reconciliation sweep endpoint for automatic image resolution.
//
// Steady-state safety net for the `after()` create hooks - retries any
// food / supplement / meal row that is still missing an image (never
// attempted, still 'pending', or previously 'unresolved' and now stale).
// Same auth + shape as app/api/cron/notifications/route.ts: fails CLOSED on
// a missing CRON_SECRET, runs on Node (Supabase admin client), bounded
// duration. Called daily by .github/workflows/images-cron.yml.

import { createAdminClient } from '@/lib/supabase/admin'
import { runImageSweep } from '@/lib/images/sweep'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const summary = await runImageSweep(createAdminClient())
    const totalErrors = summary.food.errors + summary.supplement.errors + summary.meal.errors
    return Response.json(summary, { status: totalErrors > 0 ? 207 : 200 })
  } catch (err) {
    console.error('[cron/images] sweep failed:', err)
    return Response.json({ error: 'Image sweep failed.' }, { status: 500 })
  }
}
