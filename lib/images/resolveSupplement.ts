// Supplement / vitamin image resolution orchestration.
//
// PURE of I/O: both search functions are injected (unit-tested with fakes;
// lib/images/runResolve.ts binds the real server-only clients).
//
// Strategy (spec section 3): exact product FIRST, generic Pexels only as a
// clearly-labelled representative fallback.
//   1. curated override map           -> resolved
//   2. Open Food Facts product search -> exact product photo, resolved
//   3. precise representative Pexels  -> representative (is_representative)
//   4. nothing confident              -> null  (row left on the pill icon)

import {
  parseSupplementName,
  supplementKey,
  buildProductSearchTerms,
  buildSupplementPexelsQuery,
  supplementNoun,
  type ParsedSupplement
} from './supplementQuery'
import { overrideFor } from './overrides'
import { pickBest, type ScoredCandidate } from './score'
import type { CandidateSearch } from './resolveFood'
import type { ImageCandidate, ResolvedImage } from './types'

// Generic descriptors that, on their own, do not distinguish one product
// from another - many unrelated products across many categories share these
// words. QA found a fictional supplement ("Zzyxtrenolone Peak Recovery
// Blend") spuriously matched to an unrelated coffee product ("Pikes Peak
// Blend") purely because "blend" - the last word of the parsed product,
// hence the required visual-anchor noun - happened to appear in both. When
// the anchor noun is one of these, a match may only be trusted as the EXACT
// product if the parsed brand is ALSO corroborated in the candidate;
// otherwise sharing a generic word is not evidence of product identity.
const GENERIC_PRODUCT_WORDS = new Set([
  'blend', 'powder', 'complex', 'formula', 'extract',
  'capsule', 'capsules', 'tablet', 'tablets',
  'supplement', 'supplements', 'protein'
])

function candidateMentionsBrand(candidate: ImageCandidate, brand: string): boolean {
  const hay = `${candidate.alt} ${candidate.haystack}`.toLowerCase()
  return hay.includes(brand.toLowerCase())
}

// An Open Food Facts match is trustworthy enough to claim as the EXACT
// product (image_status='resolved', is_representative=false) only when:
//   - it clears the HIGH confidence tier - a MEDIUM match (the tier the
//     false-positive above actually scored) must NEVER be labelled exact,
//     since "resolved" is the strongest claim this system makes; and
//   - if its anchor noun is one of the generic words above, the parsed
//     brand is also present in the candidate. With no brand to corroborate
//     against, a generic-word-only match can never be classified exact - it
//     falls through to the representative Pexels step instead.
// This never touches score.ts's general HIGH/MEDIUM/LOW tiering (shared
// with food and meal resolution, which already work correctly) - it only
// raises the bar for the one claim ("this IS the product") that most needs
// it.
function isTrustworthyExactMatch(best: ScoredCandidate, parsed: ParsedSupplement, noun: string): boolean {
  if (best.tier !== 'HIGH') return false
  if (GENERIC_PRODUCT_WORDS.has(noun)) {
    if (!parsed.brand) return false
    if (!candidateMentionsBrand(best.candidate, parsed.brand)) return false
  }
  return true
}

export type SupplementImageInput = {
  name: string
}

export type SupplementSearchers = {
  // Open Food Facts product search (exact-product first).
  searchProduct: CandidateSearch
  // Pexels stock search (representative fallback).
  searchStock: CandidateSearch
}

export async function resolveSupplementImage(
  supplement: SupplementImageInput,
  { searchProduct, searchStock }: SupplementSearchers
): Promise<ResolvedImage | null> {
  const parsed = parseSupplementName(supplement.name)

  // 1. curated override
  const override = overrideFor(supplementKey(parsed))
  if (override) return override

  // 2. exact product from Open Food Facts - only ever trusted as EXACT when
  // isTrustworthyExactMatch clears both the HIGH-confidence bar and (for a
  // generic anchor noun) brand corroboration. A merely-MEDIUM or
  // generic-word-only match is not exact evidence and falls through to the
  // representative Pexels step below instead.
  const productTerms = buildProductSearchTerms(parsed)
  const noun = supplementNoun(parsed)
  const productCandidates = await searchProduct(productTerms)
  const bestProduct = pickBest(productCandidates, productTerms, noun)
  if (bestProduct && isTrustworthyExactMatch(bestProduct, parsed, noun)) {
    const c = bestProduct.candidate
    return {
      url: c.url,
      alt: c.alt || `Photo of ${parsed.raw}`,
      attribution: { ...c.attribution, is_representative: false },
      status: 'resolved'
    }
  }

  // 3. representative Pexels fallback - precise query, never the bare label
  const stockQuery = buildSupplementPexelsQuery(parsed)
  const stockCandidates = await searchStock(stockQuery)
  const bestStock = pickBest(stockCandidates, stockQuery, noun)
  if (bestStock) {
    const c = bestStock.candidate
    return {
      url: c.url,
      alt: c.alt || `${parsed.product} supplement (representative image)`,
      attribution: { ...c.attribution, is_representative: true },
      status: 'representative'
    }
  }

  // 4. nothing confident
  return null
}
