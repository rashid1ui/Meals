// Shared, provider-agnostic types for the AI Outside-Plan Food Scanner's
// vision layer. Nothing in this file (or anything that imports only from
// this file) may know Kimi exists - that knowledge is confined to
// providers/kimi.ts. This is what makes the vendor swappable later (a
// second file under providers/ plus a config flip in index.ts) without
// touching the rest of the app, mirroring the existing injected-function
// pattern this codebase already uses for pluggable image sources
// (lib/images/resolveFood.ts's CandidateSearch type).

// ---- Request ----

export interface FoodAnalysisRequest {
  // Already normalized by Phase 2 (lib/outsidePlan/imageProcessing.ts) -
  // resized, EXIF-stripped, JPEG-encoded. This module never receives a
  // raw/unvalidated upload.
  imageBuffer: Buffer
  mimeType: string
}

// ---- Normalized result (Question 5) ----

export interface FoodAnalysisItem {
  name: string
  // Null when the image does not support a reliable weight estimate -
  // never a fabricated number standing in for "unknown" (Question 5/7 of
  // the food-recognition prompt requirements: prefer null over false
  // precision).
  estimatedWeightG: number | null
  estimatedPortionDescription: string | null
  // 0-1. Null when the model gives no usable confidence signal for this
  // specific item.
  confidence: number | null
  notes: string | null
}

export interface FoodAnalysisResult {
  // Explicit "is this actually a food photo" signal, so a menu photo, a
  // blank wall, or an unrelated object is never silently forced into a
  // fabricated "food" result (approved design, Question 5 edge cases).
  isFoodPhoto: boolean
  items: FoodAnalysisItem[]
  // 0-1. Whole-analysis confidence, independent of any one item's.
  overallConfidence: number | null
  mealDescription: string | null
  // Human-readable caveats surfaced to the review UI later (Phase 5) -
  // e.g. "hidden sauces may add calories not visible in the photo",
  // "multiple items overlap and could not be separated reliably".
  warnings: string[]
}

// Deliberately NOT included here: calories, protein, carbs, fat. This
// phase's vision layer identifies food and estimates portions only -
// nutrition resolution is Phase 4, and the vision model is never the
// authoritative nutrition source (Question 5, Phase 3 instructions
// section 16).

// ---- Errors ----
// A small, deliberately flat taxonomy - enough for the caller (Phase 5/6's
// server action) to decide "retry", "show a rate-limit message", or "let
// the user retake/enter manually", without leaking provider internals.
export type VisionErrorCode =
  | 'VISION_PROVIDER_UNAVAILABLE' // e.g. missing/misconfigured API key - no network call was even attempted
  | 'VISION_AUTH_ERROR' // provider rejected our credentials (401/403)
  | 'VISION_RATE_LIMITED' // provider rate/quota limit hit (429)
  | 'VISION_TIMEOUT' // our own request deadline elapsed
  | 'VISION_NETWORK_ERROR' // transport-level failure (DNS, connection reset, etc.)
  | 'VISION_PROVIDER_ERROR' // provider-side failure we can't attribute to the request (5xx, or an unexpected 4xx like "model not found")
  | 'VISION_INVALID_RESPONSE' // 200 OK, but the body wasn't parseable/valid JSON matching our schema
  | 'VISION_NO_FOOD_DETECTED' // valid response, but no usable food identified (not a food photo, or zero items)

export interface VisionAnalysisError {
  code: VisionErrorCode
  // Safe to surface to logs/UI - never a raw provider error string, which
  // could carry provider-specific wording or (in a worst case) an echoed
  // fragment of the request. See providers/kimi.ts's error mapping.
  message: string
}

export interface VisionAnalysisOutcome {
  model: string
  latencyMs: number
  result: FoodAnalysisResult | null
  error: VisionAnalysisError | null
}

// ---- Provider abstraction ----

export interface VisionProvider {
  readonly name: string
  // True as soon as whatever the provider needs (an API key, etc.) is
  // present - checked before ever attempting a network call.
  isConfigured(): boolean
  analyzeFoodImage(request: FoodAnalysisRequest): Promise<VisionAnalysisOutcome>
}
