// Curated supplement / product image overrides.
//
// A small, hand-verified map for well-known products where the automatic
// Open Food Facts + Pexels pipeline reliably fails or is ambiguous. Keyed by
// the normalised product key from supplementQuery.ts's `supplementKey()`.
// This is the ONLY place a supplement image URL is hardcoded - everything
// else is resolved at runtime.
//
// Each entry MUST be a stable, hotlink-safe https image plus honest
// attribution (never claim Gym Meals owns it). Leave this map small; prefer
// fixing the query in supplementQuery.ts over adding entries here.

import type { ResolvedImage } from './types'

export const SUPPLEMENT_IMAGE_OVERRIDES: Record<string, ResolvedImage> = {
  // (intentionally empty at launch - the runtime pipeline covers the common
  // vitamins/minerals. Add a verified entry here only when a specific
  // branded product is seen resolving to a wrong or generic image.)
}

// Looks up a curated override by normalised key. Returns null when there is
// no entry, so the caller falls through to Open Food Facts / Pexels.
export function overrideFor(key: string): ResolvedImage | null {
  return SUPPLEMENT_IMAGE_OVERRIDES[key] ?? null
}
