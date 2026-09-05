import 'server-only'

// Reconciliation sweep behind /api/cron/images. Steady-state safety net for
// the `after()` create hooks: picks up rows that were never resolved (killed
// serverless invocation, transient API failure, a row created by a path
// that didn't schedule, or the pre-existing backlog) and retries them,
// rate-limited. Runs daily - images are not time-sensitive.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAndPersist } from './runResolve'
import type { ImageEntityKind } from './types'
import type { ImageTable } from './persist'

const TABLE_BY_KIND: Record<ImageEntityKind, ImageTable> = {
  food: 'food_database',
  supplement: 'user_supplements',
  meal: 'meals'
}

export type SweepTableSummary = {
  scanned: number
  resolved: number
  representative: number
  unresolved: number
  skipped: number
  errors: number
}

export type SweepSummary = Record<ImageEntityKind, SweepTableSummary>

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

function emptySummary(): SweepTableSummary {
  return { scanned: 0, resolved: 0, representative: 0, unresolved: 0, skipped: 0, errors: 0 }
}

async function sweepKind(
  admin: SupabaseClient,
  kind: ImageEntityKind,
  perTable: number,
  staleCutoffIso: string
): Promise<SweepTableSummary> {
  const table = TABLE_BY_KIND[kind]
  const summary = emptySummary()

  // status never attempted / pending / previously unresolved, AND not
  // checked recently. `user_provided` and already-'resolved' rows are
  // excluded by construction.
  const { data, error } = await admin
    .from(table)
    .select('id, image_checked_at, image_status')
    .or('image_status.is.null,image_status.in.(pending,unresolved)')
    .or(`image_checked_at.is.null,image_checked_at.lt.${staleCutoffIso}`)
    .limit(perTable)

  if (error) {
    console.error(`[images/sweep] ${table} select failed:`, error.message)
    summary.errors++
    return summary
  }

  const rows = (data as { id: string }[] | null) ?? []
  for (const row of rows) {
    summary.scanned++
    const result = await resolveAndPersist(admin, { kind, id: row.id })
    if (result.outcome === 'stored') {
      if (result.status === 'representative') summary.representative++
      else summary.resolved++
    } else if (result.outcome === 'unresolved') summary.unresolved++
    else if (result.outcome === 'skipped') summary.skipped++
    else summary.errors++
    await sleep(300) // gentle on the Pexels free-tier rate limit
  }
  return summary
}

export async function runImageSweep(
  admin: SupabaseClient,
  opts: { perTable?: number; staleDays?: number } = {}
): Promise<SweepSummary> {
  const perTable = opts.perTable ?? 20
  const staleDays = opts.staleDays ?? 7
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString()

  return {
    food: await sweepKind(admin, 'food', perTable, cutoff),
    supplement: await sweepKind(admin, 'supplement', perTable, cutoff),
    meal: await sweepKind(admin, 'meal', perTable, cutoff)
  }
}
