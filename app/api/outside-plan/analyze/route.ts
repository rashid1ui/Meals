// Orchestration endpoint for the Outside-Plan Food Scanner (Phase 5).
//
// A Route Handler, not a Server Action: the raw upload can be up to 8 MiB
// (FOOD_SCAN_MAX_UPLOAD_BYTES) and Server Actions cap request bodies at 1 MiB
// by default. This keeps the large multipart upload off the action path
// without raising the global serverActions.bodySizeLimit for every action in
// the app. The small JSON confirm step is a normal Server Action
// (app/dashboard/outside-plan-actions.ts).
//
// Pipeline (all server-side, user identity always from the session - a
// client-supplied user_id is never read):
//   multipart file
//     -> validateFoodScanUpload  (Phase 2: magic-byte sniff, size, format)
//     -> normalizeFoodScanImage  (Phase 2: rotate, resize, strip EXIF, JPEG)
//     -> uploadFoodScanImage     (Phase 2: private bucket, {uid}/{uuid}.jpg)
//     -> analyzeFoodScan         (Phase 3: user-scoped cache + Kimi + event log)
//     -> resolveOutsidePlanNutrition (Phase 4: food_database matching)
//     -> { scanEventId, imageUrl (signed, short-lived), analysis, resolved,
//          matchedFoods }        (consumed by the review screen)
//
// KIMI_API_KEY / the service-role key never appear here - analyzeFoodScan
// reaches Kimi through lib/ai-vision, and every Supabase call uses the
// requesting user's own cookie-scoped client so RLS is the real boundary.

import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { validateFoodScanUpload } from '@/lib/outsidePlan/imageValidation'
import { normalizeFoodScanImage } from '@/lib/outsidePlan/imageProcessing'
import { uploadFoodScanImage, deleteFoodScanImage, getFoodScanImageSignedUrl } from '@/lib/outsidePlan/storage'
import { analyzeFoodScan } from '@/lib/outsidePlan/scanAnalysisService'
import { fetchActiveFoodCandidates } from '@/lib/outsidePlan/nutritionResolutionService'
import { resolveOutsidePlanNutrition } from '@/lib/outsidePlan/nutritionResolution'
import { FOOD_SCAN_MAX_UPLOAD_BYTES } from '@/lib/outsidePlan/constants'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import type { VisionErrorCode } from '@/lib/ai-vision/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UPLOAD_REASON_MESSAGE: Record<string, string> = {
  too_large: `That image is over the ${Math.round(FOOD_SCAN_MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit. Try a smaller photo.`,
  unrecognized_format: 'That file is not a supported image. Use a JPEG, PNG, WebP, or HEIC photo.',
  empty: 'That file was empty. Choose a photo and try again.'
}

// Maps the vision layer's flat error taxonomy to a user-safe message + HTTP
// status. Raw provider wording never reaches the client (Phase 3 section
// 26) - only these fixed strings.
function describeVisionError(code: VisionErrorCode): { status: number; message: string; retryable: boolean } {
  switch (code) {
    case 'VISION_NO_FOOD_DETECTED':
      return { status: 422, message: 'We could not find any food in that photo. Try a clearer, closer shot of the food itself.', retryable: true }
    case 'VISION_RATE_LIMITED':
      return { status: 503, message: 'Food analysis is busy right now. Wait a moment and try again.', retryable: true }
    case 'VISION_TIMEOUT':
      return { status: 504, message: 'Food analysis took too long. Try again, or enter the food manually.', retryable: true }
    case 'VISION_PROVIDER_UNAVAILABLE':
    case 'VISION_AUTH_ERROR':
    case 'VISION_PROVIDER_ERROR':
    case 'VISION_NETWORK_ERROR':
      return { status: 503, message: 'Food analysis is temporarily unavailable. Please try again shortly.', retryable: true }
    case 'VISION_INVALID_RESPONSE':
      return { status: 502, message: 'We could not read the analysis result. Try again with another photo.', retryable: true }
    default:
      return { status: 500, message: 'Something went wrong analyzing that photo. Please try again.', retryable: true }
  }
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return Response.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Please sign in and try again.' } }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Could not read the upload.' } }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ ok: false, error: { code: 'NO_FILE', message: 'Choose a photo to analyze.' } }, { status: 400 })
  }
  if (file.size > FOOD_SCAN_MAX_UPLOAD_BYTES) {
    return Response.json({ ok: false, error: { code: 'INVALID_IMAGE', message: UPLOAD_REASON_MESSAGE.too_large } }, { status: 413 })
  }

  const rawBytes = Buffer.from(await file.arrayBuffer())

  const validation = validateFoodScanUpload(rawBytes)
  if (!validation.ok) {
    return Response.json(
      { ok: false, error: { code: 'INVALID_IMAGE', message: UPLOAD_REASON_MESSAGE[validation.reason] ?? 'That image could not be used.' } },
      { status: validation.reason === 'too_large' ? 413 : 400 }
    )
  }

  let normalized: Buffer
  try {
    normalized = await normalizeFoodScanImage(rawBytes)
  } catch (err) {
    console.error('[api/outside-plan/analyze] image normalization failed:', err)
    return Response.json(
      { ok: false, error: { code: 'IMAGE_PROCESSING_FAILED', message: 'We could not process that photo. Try a different one.' } },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const upload = await uploadFoodScanImage(supabase, user.id, normalized)
  if (!upload.ok) {
    console.error('[api/outside-plan/analyze] upload failed:', upload.error)
    return Response.json(
      { ok: false, error: { code: 'UPLOAD_FAILED', message: 'We could not save that photo. Please try again.' } },
      { status: 500 }
    )
  }

  const outcome = await analyzeFoodScan(supabase, {
    userId: user.id,
    normalizedImageBytes: normalized,
    imageStoragePath: upload.path
  })

  if (outcome.outcome === 'error') {
    // A hard analysis failure: the uploaded object is never going to become
    // a confirmed entry, so delete it now (best effort) and clear the
    // pointer on its event row rather than waiting for the orphan sweep.
    await deleteFoodScanImage(supabase, upload.path).catch(() => {})
    if (outcome.eventId) {
      await supabase.from('food_scan_events').update({ image_storage_path: null }).eq('id', outcome.eventId).eq('user_id', user.id)
    }
    const described = describeVisionError(outcome.error.code)
    return Response.json(
      { ok: false, error: { code: outcome.error.code, message: described.message, retryable: described.retryable } },
      { status: described.status }
    )
  }

  const analysis = outcome.result
  const candidates = await fetchActiveFoodCandidates(supabase)
  const resolved = resolveOutsidePlanNutrition(analysis, candidates)

  // Only the candidates actually referenced by a resolved item - the review
  // screen uses these to recompute macros locally when the user edits a
  // matched item's weight (no extra AI or server call per keystroke).
  const referencedIds = new Set(resolved.items.map(i => i.matchedFoodId).filter((id): id is string => Boolean(id)))
  const matchedFoods: Record<string, FoodMacro> = {}
  for (const c of candidates) {
    if (referencedIds.has(c.id)) {
      matchedFoods[c.id] = {
        id: c.id,
        name: c.name,
        serving_size: c.serving_size,
        serving_unit: c.serving_unit,
        calories: c.calories,
        protein: c.protein,
        carbs: c.carbs,
        fat: c.fat
      }
    }
  }

  const imageUrl = await getFoodScanImageSignedUrl(supabase, upload.path)

  return Response.json({
    ok: true,
    scanEventId: outcome.eventId,
    fromCache: outcome.outcome === 'cached',
    imageUrl,
    analysis,
    resolved,
    matchedFoods
  })
}
