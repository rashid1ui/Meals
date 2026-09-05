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
  supplementNoun
} from './supplementQuery'
import { overrideFor } from './overrides'
import { pickBest } from './score'
import type { CandidateSearch } from './resolveFood'
import type { ResolvedImage } from './types'

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

  // 2. exact product from Open Food Facts
  const productTerms = buildProductSearchTerms(parsed)
  const noun = supplementNoun(parsed)
  const productCandidates = await searchProduct(productTerms)
  const bestProduct = pickBest(productCandidates, productTerms, noun)
  if (bestProduct) {
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
