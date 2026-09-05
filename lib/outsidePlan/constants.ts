// Shared configuration for the AI Outside-Plan Food Scanner (Phase 2:
// Storage). Kept as named constants rather than scattered literals so
// later phases (rate limits, retention sweep, upload validation) all read
// the same single source of truth - and so tuning a limit later is a
// one-line change, not a code hunt (approved design, Question 10).

// Storage bucket per Question 3. Private - never made public.
export const FOOD_SCAN_BUCKET = 'food-scan-photos'

// 8 MiB pre-compression ceiling on the raw upload, before server-side
// re-encoding. Matches the bucket's own file_size_limit (migration
// 0032_food_scan_storage.sql) as defense-in-depth, not the only check.
export const FOOD_SCAN_MAX_UPLOAD_BYTES = 8 * 1024 * 1024

// Accepted input formats (Question 3). HEIC is the default format for
// photos taken on iOS.
export const FOOD_SCAN_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
export type FoodScanAllowedMimeType = (typeof FOOD_SCAN_ALLOWED_MIME_TYPES)[number]

// Every accepted upload is re-encoded to JPEG server-side (normalizes
// format, strips EXIF, bounds dimensions) - this is the only stored/
// AI-submitted representation, regardless of the original upload's format.
export const FOOD_SCAN_OUTPUT_MIME_TYPE = 'image/jpeg'
export const FOOD_SCAN_OUTPUT_EXTENSION = 'jpg'

// Longest edge after resize. Vision APIs downsample large images internally
// anyway (Question 3) - this keeps upload size and AI image-token cost
// bounded without a visible quality loss for food identification.
export const FOOD_SCAN_MAX_DIMENSION_PX = 1600
export const FOOD_SCAN_JPEG_QUALITY = 82

// Signed URLs for the review screen are always short-lived (Question 3) -
// the bucket is private and no permanent public URL is ever issued.
export const FOOD_SCAN_SIGNED_URL_TTL_SECONDS = 10 * 60

// Finalized product decision: photos are retained 90 days, then purged by
// the retention sweep - the outside_plan_food_entries row and its
// nutrition data are never deleted alongside the photo.
export const FOOD_SCAN_RETENTION_DAYS = 90

// An upload that never becomes a confirmed entry (the user closes the tab
// mid-review, a crash, etc.) is swept as an orphan well before the 90-day
// retention window, since it was never going to be kept regardless.
export const FOOD_SCAN_ORPHAN_MAX_AGE_HOURS = 24

// Phase 3 (Kimi Vision AI): how long a successful analysis stays eligible
// for cache reuse by (user_id, image_hash) before a resubmission triggers a
// fresh AI call. Matches the approved design's cache-window decision.
export const FOOD_SCAN_CACHE_TTL_HOURS = 48

// Structural bounds enforced on the AI's structured JSON output
// (lib/ai-vision/schema.ts) - kept here alongside the other scanner limits
// rather than inline in the schema file, so every numeric ceiling this
// feature enforces lives in one place.
export const FOOD_SCAN_MAX_ITEMS_PER_ANALYSIS = 12
export const FOOD_SCAN_MAX_WARNINGS_PER_ANALYSIS = 10
export const FOOD_SCAN_MAX_ITEM_NAME_LENGTH = 200
export const FOOD_SCAN_MAX_PORTION_DESCRIPTION_LENGTH = 200
export const FOOD_SCAN_MAX_NOTES_LENGTH = 500
export const FOOD_SCAN_MAX_MEAL_DESCRIPTION_LENGTH = 300
export const FOOD_SCAN_MAX_WARNING_LENGTH = 300
// A generous per-item ceiling - not a nutrition bound (that's Phase 4's
// outside_plan_food_entries.calories/protein/carbs/fat CHECK constraints),
// just a sanity bound against an obviously hallucinated weight.
export const FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G = 3000
