// Cache lookup + food_scan_events logging for a single scan attempt. Pure
// orchestration, no 'server-only' guard: the actual vision-analysis
// function is INJECTED (AnalyzeFoodImageFn) rather than imported from
// lib/ai-vision directly, so this file never transitively reads
// KIMI_API_KEY and stays directly unit-testable with a fake analyzer -
// exactly the same split this codebase already uses for
// lib/images/resolveFood.ts (pure, injected CandidateSearch) vs.
// lib/images/runResolve.ts (thin server-only glue that wires in the real
// Pexels/OFF clients). scanAnalysisService.ts is this feature's equivalent
// of runResolve.ts.
//
// Cache semantics (approved design, Question 2/11 - "Phase 1 intentionally
// added image_hash and ai_response to support reusable scan results...
// cache lookup must remain user-scoped"): a hit is scoped to the EXACT
// same (user_id, image_hash) pair, never cross-user, and only a row whose
// AI call actually succeeded (status='succeeded', ai_response present) is
// eligible - a failed or malformed prior attempt is never served back as
// if it were a good result.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodAnalysisResult, VisionAnalysisError, VisionAnalysisOutcome, VisionErrorCode } from '@/lib/ai-vision/types'
import { computeFoodScanImageHash } from './imageHash'
import { FOOD_SCAN_CACHE_TTL_HOURS } from './constants'

export type AnalyzeFoodImageFn = (request: { imageBuffer: Buffer; mimeType: string }) => Promise<VisionAnalysisOutcome>

interface CachedFoodScanEventRow {
  id: string
  user_id: string
  image_hash: string | null
  ai_response: unknown
  created_at: string
}

// Pure, no I/O - the single most safety-critical function in this file.
// Candidates are expected pre-filtered by the caller's query (user_id,
// image_hash, status='succeeded', ai_response not null) and ordered most-
// recent-first, but this function re-checks user_id and image_hash itself
// regardless, on the principle that a cache-security invariant should
// never rely solely on the caller having built the query correctly.
export function selectCachedFoodScanEvent(
  candidates: CachedFoodScanEventRow[],
  params: { userId: string; imageHash: string; ttlHours: number; now?: Date }
): { id: string; result: FoodAnalysisResult } | null {
  const cutoffMs = (params.now ?? new Date()).getTime() - params.ttlHours * 60 * 60 * 1000

  for (const row of candidates) {
    if (row.user_id !== params.userId) continue // never another user's analysis, no matter what the query returned
    if (row.image_hash !== params.imageHash) continue
    if (new Date(row.created_at).getTime() < cutoffMs) continue
    if (!row.ai_response || typeof row.ai_response !== 'object') continue
    return { id: row.id, result: row.ai_response as FoodAnalysisResult }
  }
  return null
}

export async function findCachedFoodScanAnalysis(
  supabase: SupabaseClient,
  userId: string,
  imageHash: string
): Promise<{ id: string; result: FoodAnalysisResult } | null> {
  const { data, error } = await supabase
    .from('food_scan_events')
    .select('id, user_id, image_hash, ai_response, created_at')
    .eq('user_id', userId)
    .eq('image_hash', imageHash)
    .eq('status', 'succeeded')
    .not('ai_response', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !data) return null
  return selectCachedFoodScanEvent(data as CachedFoodScanEventRow[], { userId, imageHash, ttlHours: FOOD_SCAN_CACHE_TTL_HOURS })
}

function mapErrorToEventStatus(code: VisionErrorCode): 'failed' | 'timeout' | 'rejected_invalid_output' {
  if (code === 'VISION_TIMEOUT') return 'timeout'
  if (code === 'VISION_INVALID_RESPONSE') return 'rejected_invalid_output'
  return 'failed'
}

export type FoodScanAnalysisOutcome =
  | { outcome: 'cached'; result: FoodAnalysisResult; eventId: string | null }
  | { outcome: 'analyzed'; result: FoodAnalysisResult; eventId: string | null; model: string; latencyMs: number }
  | { outcome: 'error'; error: VisionAnalysisError; eventId: string | null; model: string; latencyMs: number }

export interface RunFoodScanAnalysisParams {
  userId: string
  // Already normalized (Phase 2: resized, EXIF-stripped, JPEG-encoded).
  normalizedImageBytes: Buffer
  mimeType: string
  // Recorded on the food_scan_events row so an abandoned/never-confirmed
  // scan's photo can still be found and cleaned up later (Phase 2's
  // pruneOrphanedFoodScanUploads). Null when there is genuinely no
  // Storage object for this attempt.
  imageStoragePath: string | null
}

export async function runFoodScanAnalysis(
  supabase: SupabaseClient,
  analyzeImage: AnalyzeFoodImageFn,
  params: RunFoodScanAnalysisParams
): Promise<FoodScanAnalysisOutcome> {
  const imageHash = computeFoodScanImageHash(params.normalizedImageBytes)

  const cached = await findCachedFoodScanAnalysis(supabase, params.userId, imageHash)
  if (cached) {
    // A cache hit still gets its own ledger row (status='served_from_cache')
    // so usage history stays complete - it does NOT count against the
    // Phase 8 daily/monthly AI-call quota, since no AI call was made.
    const { data: cacheEvent, error: cacheEventError } = await supabase
      .from('food_scan_events')
      .insert({ user_id: params.userId, status: 'served_from_cache', image_hash: imageHash, image_storage_path: params.imageStoragePath })
      .select('id')
      .single()
    if (cacheEventError) console.error('[outsidePlan/scanAnalysis] failed to record cache-hit event:', cacheEventError.message)
    return { outcome: 'cached', result: cached.result, eventId: cacheEvent?.id ?? null }
  }

  const analysis = await analyzeImage({ imageBuffer: params.normalizedImageBytes, mimeType: params.mimeType })

  const eventRow = {
    user_id: params.userId,
    status: analysis.error ? mapErrorToEventStatus(analysis.error.code) : 'succeeded',
    image_hash: imageHash,
    ai_model: analysis.model,
    latency_ms: analysis.latencyMs,
    error_message: analysis.error?.message ?? null,
    // Only OUR normalized FoodAnalysisResult is stored here - never Kimi's
    // raw provider envelope (request/response ids, token accounting, etc.)
    // which we don't need and which would leak provider-specific content
    // if this column were ever surfaced (approved design's Question 2
    // revision; Phase 3 instructions section 10/12). A future cache hit
    // reads this exact shape back with zero provider-specific parsing.
    ai_response: analysis.result ?? null,
    image_storage_path: params.imageStoragePath
  }

  const { data: insertedEvent, error: insertError } = await supabase.from('food_scan_events').insert(eventRow).select('id').single()
  if (insertError) console.error('[outsidePlan/scanAnalysis] failed to record food_scan_events row:', insertError.message)
  const eventId = insertedEvent?.id ?? null

  if (analysis.error) {
    return { outcome: 'error', error: analysis.error, eventId, model: analysis.model, latencyMs: analysis.latencyMs }
  }
  return { outcome: 'analyzed', result: analysis.result as FoodAnalysisResult, eventId, model: analysis.model, latencyMs: analysis.latencyMs }
}
