// Pure hashing helper - deliberately separate from storage.ts/scanAnalysis.ts
// so it has zero dependencies (no Supabase, no sharp) and is trivially
// unit-testable. Used as the food_scan_events.image_hash / duplicate-
// detection and cache-lookup key (approved design, Question 2/10/11).

import { createHash } from 'node:crypto'

export function computeFoodScanImageHash(normalizedImageBytes: Buffer): string {
  return createHash('sha256').update(normalizedImageBytes).digest('hex')
}
