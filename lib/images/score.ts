// Pure candidate scoring + confidence tiering for image resolution.
//
// Ported verbatim (behaviour-preserving) out of scripts/assign-food-images.ts
// so the exact same ranking now backs BOTH the one-off backfill script and
// the runtime resolver (lib/images/resolveFood|Supplement|Meal.ts). No
// Supabase, no network, no React.
//
// The golden rule (spec section 5): a candidate is only ever accepted if the
// primary noun of what we searched for actually appears in the photo's
// alt/slug. HIGH + MEDIUM are stored; LOW is rejected and the entity keeps
// its emoji/pill fallback - never a wrong image just to reach full coverage.

import type { ImageCandidate, ImageConfidence } from './types'

const STOPWORDS = new Set(['of', 'a', 'the', 'and', 'with', 'on', 'in', 'raw', 'fresh', 'food'])

// Words in a candidate's alt/slug that signal the wrong kind of shot for a
// single ingredient (a plated dish for a raw ingredient, a person, a live
// animal, packaging text).
const NEGATIVE = [
  'person', 'people', 'woman', 'man ', ' men', 'child', 'family', 'wife', 'husband',
  'recipe', 'restaurant', 'cafe', 'menu', 'logo', 'label', 'scrabble', 'portrait',
  'sunset', 'field ', 'farm ', 'tree', 'palm', 'grazing', 'wildlife'
]

function stem(w: string): string {
  return w.replace(/ies$/, 'y').replace(/(es|s)$/, '')
}

function hayHas(hay: string, word: string): boolean {
  const w = word.toLowerCase()
  return hay.includes(w) || hay.includes(stem(w)) || hay.includes(w + 's') || hay.includes(stem(w) + 's')
}

// The meaningful tokens of a search query - length > 2, not a stopword.
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
}

export type ScoredCandidate = {
  candidate: ImageCandidate
  score: number
  tier: ImageConfidence
  coverage: number
  nounHit: boolean
  neg: number
}

// Scores one candidate against the query tokens and the required visual
// anchor noun. Identical formula to the script's scoreCandidate().
export function scoreCandidate(
  candidate: ImageCandidate,
  tokens: string[],
  noun: string
): ScoredCandidate {
  const hay = `${candidate.alt} ${candidate.haystack}`.toLowerCase().replace(/[-/]/g, ' ')

  const nounHit = noun ? hayHas(hay, noun) : true
  const tokenHits = tokens.filter(t => hayHas(hay, t)).length
  const coverage = tokens.length ? tokenHits / tokens.length : 0
  const neg = NEGATIVE.filter(w => hay.includes(w)).length

  const score = +(coverage + (nounHit ? 0.5 : -1) - neg * 0.4).toFixed(2)
  let tier: ImageConfidence = 'LOW'
  if (nounHit && neg === 0 && coverage >= 0.6) tier = 'HIGH'
  else if (nounHit && neg <= 1 && coverage >= 0.34) tier = 'MEDIUM'

  return { candidate, score, tier, coverage: +coverage.toFixed(2), nounHit, neg }
}

// Ranks every candidate and returns the single best one, or null when the
// list is empty or the best is still LOW confidence. NEVER returns
// candidates[0] blindly - the whole point of this module.
export function pickBest(
  candidates: readonly ImageCandidate[],
  query: string,
  noun: string
): ScoredCandidate | null {
  const tokens = queryTokens(query)
  const ranked = candidates
    .map(c => scoreCandidate(c, tokens, noun))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.tier === 'LOW') return null
  return best
}
