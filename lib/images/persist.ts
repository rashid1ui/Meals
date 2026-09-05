// Persists a resolved image (or an "unresolved" marker) onto an entity row.
//
// Not server-only: it takes an already-constructed admin SupabaseClient and
// imports no secret, so it is unit-tested with a fake client. The real
// caller (lib/images/runResolve.ts / the cron sweep) passes createAdminClient().
//
// Safety invariants (spec section 5 + "existing image data is not
// overwritten unnecessarily"):
//   - NEVER overwrite a row whose image_status is 'user_provided'.
//   - NEVER overwrite a row that already has a non-null image_url, unless
//     `force` is passed (only scripts/assign-food-images.ts --force does).
//   - A null `resolved` records status='unresolved' + image_checked_at and
//     leaves image_url NULL - the UI keeps its emoji/pill fallback and the
//     row is discoverable via `WHERE image_status = 'unresolved'`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResolvedImage } from './types'

export type ImageTable = 'food_database' | 'user_supplements' | 'meals'

export type PersistResult =
  | { outcome: 'stored'; status: 'resolved' | 'representative' }
  | { outcome: 'unresolved' }
  | { outcome: 'skipped'; reason: 'user_provided' | 'already_has_image' }
  | { outcome: 'error'; message: string }

type CurrentRow = { image_url: string | null; image_status: string | null }

export async function persistImage(
  admin: SupabaseClient,
  table: ImageTable,
  id: string,
  resolved: ResolvedImage | null,
  opts: { force?: boolean } = {}
): Promise<PersistResult> {
  const { data: current, error: readErr } = await admin
    .from(table)
    .select('image_url, image_status')
    .eq('id', id)
    .maybeSingle<CurrentRow>()

  if (readErr) return { outcome: 'error', message: readErr.message }

  if (current?.image_status === 'user_provided') {
    return { outcome: 'skipped', reason: 'user_provided' }
  }
  if (!opts.force && current?.image_url) {
    return { outcome: 'skipped', reason: 'already_has_image' }
  }

  const checkedAt = new Date().toISOString()

  if (!resolved) {
    const { error } = await admin
      .from(table)
      .update({ image_status: 'unresolved', image_checked_at: checkedAt })
      .eq('id', id)
    if (error) return { outcome: 'error', message: error.message }
    console.warn(`[images/persist] ${table} ${id}: no confident match - left on fallback (unresolved).`)
    return { outcome: 'unresolved' }
  }

  const { error } = await admin
    .from(table)
    .update({
      image_url: resolved.url,
      image_alt: resolved.alt,
      image_attribution: resolved.attribution,
      image_status: resolved.status,
      image_checked_at: checkedAt
    })
    .eq('id', id)
  if (error) return { outcome: 'error', message: error.message }

  return { outcome: 'stored', status: resolved.status }
}
