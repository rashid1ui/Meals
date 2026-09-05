import 'server-only'

// Thin server-only glue binding the real Kimi-backed analyzeFoodImage into
// runFoodScanAnalysis's injected-dependency shape - this feature's
// equivalent of lib/images/runResolve.ts. This is the ONLY file Phase 5/6's
// server action needs to import; everything it depends on (KIMI_API_KEY
// via lib/ai-vision, this bucket's Supabase writes) is guarded here.
//
// Not independently unit-tested, by the same convention runResolve.ts
// itself isn't: the logic worth testing lives in the pure module it wires
// together (scanAnalysis.ts's selectCachedFoodScanEvent/runFoodScanAnalysis),
// and the real end-to-end path is covered by the live integration test.

import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeFoodImage } from '@/lib/ai-vision'
import { runFoodScanAnalysis, type FoodScanAnalysisOutcome, type RunFoodScanAnalysisParams } from './scanAnalysis'
import { FOOD_SCAN_OUTPUT_MIME_TYPE } from './constants'

export function analyzeFoodScan(
  supabase: SupabaseClient,
  params: Omit<RunFoodScanAnalysisParams, 'mimeType'> & { mimeType?: string }
): Promise<FoodScanAnalysisOutcome> {
  return runFoodScanAnalysis(supabase, analyzeFoodImage, { ...params, mimeType: params.mimeType ?? FOOD_SCAN_OUTPUT_MIME_TYPE })
}
