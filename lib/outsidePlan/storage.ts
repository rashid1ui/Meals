// Storage operations for the food scanner's private bucket.
//
// Not server-only: like lib/images/persist.ts, every function here takes an
// already-constructed SupabaseClient rather than reading any secret itself
// (no env var is read in this file) - the actual secret-holding client
// constructors (lib/supabase/admin.ts's service-role client, lib/supabase/
// server.ts's cookie-scoped client) already carry their own guards. This
// also keeps the module importable by `node --test` (an unconditional
// `import 'server-only'` throws under plain Node - see
// lib/images/serverOnly.test.ts's source-text-only testing convention for
// modules that DO need the guard).
//
// Every function takes an already-constructed SupabaseClient rather than
// building its own, exactly like lib/images/runResolve.ts and
// lib/images/sweep.ts take an injected client - callers decide whether to
// pass the requesting user's own authenticated client (uploads, reads,
// user-initiated deletes - RLS-enforced) or the service-role admin client
// (the retention/orphan sweeps, which must act across every user's rows,
// the same justification lib/images/sweep.ts's runImageSweep already uses).

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FOOD_SCAN_BUCKET,
  FOOD_SCAN_OUTPUT_EXTENSION,
  FOOD_SCAN_OUTPUT_MIME_TYPE,
  FOOD_SCAN_ORPHAN_MAX_AGE_HOURS,
  FOOD_SCAN_RETENTION_DAYS,
  FOOD_SCAN_SIGNED_URL_TTL_SECONDS
} from './constants'

// {user_id}/{uuid}.jpg - the folder prefix is always the owning user's own
// id, which is exactly what the storage.objects RLS policies (migration
// 0032_food_scan_storage.sql) check via (storage.foldername(name))[1].
export function buildFoodScanStoragePath(userId: string): string {
  return `${userId}/${crypto.randomUUID()}.${FOOD_SCAN_OUTPUT_EXTENSION}`
}

export type UploadFoodScanImageResult = { ok: true; path: string } | { ok: false; error: string }

// Uploads an already-normalized (resized, EXIF-stripped, JPEG-encoded -
// see imageProcessing.ts) buffer. Pass the requesting user's own
// authenticated client so the RLS insert policy is the actual enforcement,
// not just a backstop.
export async function uploadFoodScanImage(
  supabase: SupabaseClient,
  userId: string,
  normalizedImage: Buffer
): Promise<UploadFoodScanImageResult> {
  const path = buildFoodScanStoragePath(userId)
  const { error } = await supabase.storage.from(FOOD_SCAN_BUCKET).upload(path, normalizedImage, {
    contentType: FOOD_SCAN_OUTPUT_MIME_TYPE,
    upsert: false
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, path }
}

// Short-lived signed URL for the review screen - the bucket is private and
// no permanent public URL is ever issued (Question 3/13).
export async function getFoodScanImageSignedUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(FOOD_SCAN_BUCKET).createSignedUrl(path, FOOD_SCAN_SIGNED_URL_TTL_SECONDS)
  if (error || !data) return null
  return data.signedUrl
}

// Deletes the Storage object only - never touches the
// outside_plan_food_entries row or its nutrition data. Used for immediate
// deletion on user cancel and by the sweeps below.
export async function deleteFoodScanImage(supabase: SupabaseClient, path: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.storage.from(FOOD_SCAN_BUCKET).remove([path])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export function isPastRetentionWindow(createdAt: Date, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - createdAt.getTime()
  return ageMs >= FOOD_SCAN_RETENTION_DAYS * 24 * 60 * 60 * 1000
}

export type RetentionSweepSummary = { scanned: number; deleted: number; errors: number }

// Purges photos past the 90-day retention window. Requires the service-role
// admin client (lib/supabase/admin.ts's createAdminClient()) since it must
// act across every user's rows in one pass, the same justification
// lib/images/sweep.ts's runImageSweep already uses. The
// outside_plan_food_entries row itself is only ever updated (image_storage_
// path/image_deleted_at set), never deleted - nutrition history survives
// its photo being purged, by design (Question 1/13).
export async function sweepExpiredFoodScanPhotos(admin: SupabaseClient, opts: { limit?: number } = {}): Promise<RetentionSweepSummary> {
  const limit = opts.limit ?? 100
  const cutoffIso = new Date(Date.now() - FOOD_SCAN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const summary: RetentionSweepSummary = { scanned: 0, deleted: 0, errors: 0 }

  const { data, error } = await admin
    .from('outside_plan_food_entries')
    .select('id, image_storage_path')
    .not('image_storage_path', 'is', null)
    .is('image_deleted_at', null)
    .lt('created_at', cutoffIso)
    .limit(limit)

  if (error) {
    console.error('[outsidePlan/storage] retention sweep select failed:', error.message)
    summary.errors++
    return summary
  }

  const rows = (data as { id: string; image_storage_path: string }[] | null) ?? []
  for (const row of rows) {
    summary.scanned++
    const result = await deleteFoodScanImage(admin, row.image_storage_path)
    if (!result.ok) {
      console.error('[outsidePlan/storage] retention delete failed:', row.id, result.error)
      summary.errors++
      continue
    }
    const { error: updateError } = await admin
      .from('outside_plan_food_entries')
      .update({ image_storage_path: null, image_deleted_at: new Date().toISOString() })
      .eq('id', row.id)
    if (updateError) {
      console.error('[outsidePlan/storage] retention row update failed:', row.id, updateError.message)
      summary.errors++
      continue
    }
    summary.deleted++
  }
  return summary
}

export type OrphanSweepSummary = { scanned: number; deleted: number; errors: number }

// Deletes photos from scans that were uploaded but never confirmed into an
// outside_plan_food_entries row (abandoned mid-scan: closed tab, crash, or
// a cancel whose immediate client-side delete never fired). These are swept
// well before the 90-day retention window since they were never going to be
// kept regardless. Relies on food_scan_events.image_storage_path (migration
// 0033) - the path is recorded there at upload time by the Phase 3/5/6
// orchestration, independent of whether the scan is ever confirmed.
export async function pruneOrphanedFoodScanUploads(admin: SupabaseClient, opts: { limit?: number } = {}): Promise<OrphanSweepSummary> {
  const limit = opts.limit ?? 100
  const cutoffIso = new Date(Date.now() - FOOD_SCAN_ORPHAN_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString()
  const summary: OrphanSweepSummary = { scanned: 0, deleted: 0, errors: 0 }

  const { data, error } = await admin
    .from('food_scan_events')
    .select('id, image_storage_path')
    .is('resulting_entry_id', null)
    .not('image_storage_path', 'is', null)
    .lt('created_at', cutoffIso)
    .limit(limit)

  if (error) {
    console.error('[outsidePlan/storage] orphan sweep select failed:', error.message)
    summary.errors++
    return summary
  }

  const rows = (data as { id: string; image_storage_path: string }[] | null) ?? []
  for (const row of rows) {
    summary.scanned++
    const result = await deleteFoodScanImage(admin, row.image_storage_path)
    if (!result.ok) {
      console.error('[outsidePlan/storage] orphan delete failed:', row.id, result.error)
      summary.errors++
      continue
    }
    // Clear the path (object is gone) and the cached ai_response (no longer
    // useful for cache reuse once its source photo no longer exists) - the
    // event row itself is kept for quota-history counting.
    const { error: updateError } = await admin.from('food_scan_events').update({ image_storage_path: null, ai_response: null }).eq('id', row.id)
    if (updateError) {
      console.error('[outsidePlan/storage] orphan row update failed:', row.id, updateError.message)
      summary.errors++
      continue
    }
    summary.deleted++
  }
  return summary
}
