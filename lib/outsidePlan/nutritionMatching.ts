// Pure food_database matching for the AI Outside-Plan Food Scanner's
// nutrition resolution (Phase 4). No Supabase, no network - same pattern as
// lib/nutrition/*.ts and lib/food/search.ts. Deliberately NOT the same
// substring-search algorithm as lib/food/search.ts (matchesFoodQuery),
// which is built for a human typing into a live picker and happily matches
// "chicken" against "chicken soup" - fine when a person reviews the list,
// dangerous if used to auto-select nutrition with no human in the loop.
// This module borrows its shape instead from lib/images/score.ts's proven
// approach for this exact problem elsewhere in the codebase: a hard
// "anchor" gate a candidate must pass before it's eligible at all, then a
// coverage-based score for tiering among eligible candidates.
//
// The hard gate here is stricter than score.ts's single anchor noun:
// EVERY identity token of the query (i.e. every meaningful word that isn't
// a stopword, seasoning, or preparation/state word) must appear in the
// candidate's own identity tokens. This is what makes "chicken breast"
// unable to match "chicken soup" (missing "breast") or "beef burger"
// unable to match "beef broth" (missing "burger") - not a semantic
// thesaurus, just literal identity-token containment, which is exactly
// what actually prevents a dangerous substitution.

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'in', 'on', 'some', 'side', 'plate', 'portion', 'serving'])

// Words describing HOW food was prepared, not WHAT it is - stripped from
// identity-token matching but tracked separately (see PrepState below)
// because preparation state can change nutrition dramatically (raw vs
// cooked chicken breast: 120 vs 165 kcal/100g) and deserves its own
// deliberate handling, not silent disregard.
const COOKED_WORDS = new Set([
  'cooked', 'grilled', 'fried', 'baked', 'roasted', 'steamed', 'boiled', 'poached',
  'sauteed', 'sautéed', 'smoked', 'pan-fried', 'deep-fried', 'braised', 'seared'
])
const RAW_WORDS = new Set(['raw', 'uncooked'])
// "Dry"/"dried" describes a pantry/uncooked-grain basis (dry rice, dry
// lentils) - a MUCH more calorie-dense basis than the same food once
// cooked (dry white rice ~365 kcal/100g vs cooked ~130 kcal/100g). This is
// distinct from RAW (a raw cut of meat) and gets its own explicit handling
// below, because a scanned plate of food is virtually always cooked/
// ready-to-eat, not a raw pantry ingredient - see PrepState's comment.
const DRY_WORDS = new Set(['dry', 'dried'])
const OTHER_DESCRIPTOR_WORDS = new Set([
  'fresh', 'whole', 'sliced', 'diced', 'chopped', 'minced', 'skinless', 'skinon',
  'lean', 'extra', 'virgin', 'ground', 'canned', 'frozen', 'light', 'plain'
])
const PREPARATION_WORDS = new Set([...COOKED_WORDS, ...RAW_WORDS, ...DRY_WORDS, ...OTHER_DESCRIPTOR_WORDS])

// Flavoring/seasoning words a query may include that don't change the
// underlying food's identity for matching purposes (a "lemon herb chicken
// breast" is still fundamentally chicken breast) - unmatched seasoning
// tokens don't block a match, unlike unmatched identity tokens.
const SEASONING_WORDS = new Set([
  'lemon', 'herb', 'herbs', 'garlic', 'pepper', 'peppered', 'spice', 'spiced', 'spicy',
  'sauce', 'glazed', 'honey', 'sweet', 'sour', 'seasoned', 'marinated', 'style', 'cut'
])

function stem(w: string): string {
  return w.replace(/ies$/, 'y').replace(/(es|s)$/, '')
}

function tokensEqual(a: string, b: string): boolean {
  return a === b || stem(a) === stem(b)
}

export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[(),]/g, ' ')
    .replace(/\//g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

function identityTokens(tokens: string[]): string[] {
  return tokens.filter(t => t.length > 1 && !STOPWORDS.has(t) && !PREPARATION_WORDS.has(t) && !SEASONING_WORDS.has(t))
}

// The preparation "state" implied by a name's own preparation words. Kept
// deliberately coarse (raw / cooked / dry / unspecified) rather than
// tracking every individual word, since what actually matters for
// nutrition-safety purposes is which of these very different bases a
// number was measured against.
export type PrepState = 'raw' | 'cooked' | 'dry' | 'unspecified'

function prepState(tokens: string[]): PrepState {
  if (tokens.some(t => DRY_WORDS.has(t))) return 'dry'
  if (tokens.some(t => COOKED_WORDS.has(t))) return 'cooked'
  if (tokens.some(t => RAW_WORDS.has(t))) return 'raw'
  return 'unspecified'
}

export interface FoodCandidate {
  id: string
  name: string
  category: string
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type NutritionMatchTier = 'high' | 'medium' | 'low' | 'unresolved'

export interface FoodMatchResult {
  candidate: FoodCandidate | null
  tier: NutritionMatchTier
  confidence: number
  warnings: string[]
}

interface CandidateScore {
  score: number
  warnings: string[]
}

// Scores one candidate against a query's identity tokens. Returns null if
// the candidate fails the hard identity gate (a required token is
// missing) - such a candidate is never eligible, at any tier, regardless
// of how well anything else about it matches. This hard gate, not the
// numeric score, is what actually prevents a dangerous substitution.
function scoreCandidate(candidateNameTokens: string[], candidateIdentity: string[], queryIdentity: string[], queryPrep: PrepState, candidatePrep: PrepState): CandidateScore | null {
  const missingQueryTokens = queryIdentity.filter(qt => !candidateIdentity.some(ct => tokensEqual(ct, qt)))
  if (missingQueryTokens.length > 0) return null // hard gate: every query identity token must be present

  const extraCandidateTokens = candidateIdentity.filter(ct => !queryIdentity.some(qt => tokensEqual(ct, qt)))
  const candidateLabel = candidateNameTokens.join(' ')

  let score = 1
  const warnings: string[] = []

  // Each candidate-only distinguishing word (e.g. "brown" when the query
  // just said "rice") is a real ambiguity - the query didn't specify which
  // variant, so a specific one is being assumed.
  if (extraCandidateTokens.length > 0) {
    score -= extraCandidateTokens.length * 0.2
    warnings.push(`Matched the "${extraCandidateTokens.join(' ')}" variant, which wasn't explicitly mentioned - verify this is correct.`)
  }

  // Preparation-state handling. "dry" is the dangerous case: a scanned
  // plate is virtually always cooked/ready-to-eat food, not a raw pantry
  // ingredient, so a candidate whose ONLY available basis is "dry" and
  // whose query gave no dry/dried word of its own is treated as an
  // unsafe-to-auto-apply nutrition basis - see this file's header comment.
  if (candidatePrep === 'dry' && queryPrep !== 'dry') {
    score -= 0.6
    warnings.push(
      `"${candidateLabel}" is measured in dry/uncooked form, but this looks like ready-to-eat food - using dry-weight nutrition on a cooked-weight estimate would significantly overstate calories. Please verify or enter nutrition manually.`
    )
  } else if (queryPrep !== 'unspecified' && candidatePrep !== 'unspecified' && queryPrep !== candidatePrep) {
    // e.g. query says "raw tuna" (sushi) but the only candidate is
    // "cooked"-implied, or vice versa - a real, if smaller, discrepancy.
    score -= 0.3
    warnings.push(`Requested preparation ("${queryPrep}") differs from the matched item's ("${candidatePrep}") - nutrition may not be exact.`)
  } else if (queryPrep === 'unspecified' && candidatePrep === 'cooked') {
    // No stated preparation - defaulting to "cooked" is the sensible
    // assumption for food someone is about to eat, but it IS an
    // assumption, not something Kimi confirmed, so it costs a small
    // amount of confidence and is disclosed.
    score -= 0.05
    warnings.push(`Assumed "${candidateLabel}" is cooked/ready-to-eat, since no preparation was specified - correct this if it was actually raw or a different preparation.`)
  } else if (queryPrep === 'unspecified' && candidatePrep === 'raw') {
    // No stated preparation, and this candidate is specifically RAW - a
    // weaker default than "cooked" for a scanned plate of food someone is
    // about to eat (raw sweet potato/chicken isn't a normal thing to be
    // photographing on a plate), so this costs more confidence than the
    // cooked-default case above - a "cooked" candidate for the same
    // identity tokens should win the tie-break when both exist.
    score -= 0.15
    warnings.push(`Matched to the raw/uncooked form of "${candidateLabel}", since no preparation was specified - verify this wasn't actually cooked.`)
  }

  return { score: Math.max(0, Math.min(1, score)), warnings }
}

// Finds and tiers the best food_database match for one Kimi-identified
// item name. NEVER returns a candidate that fails the hard identity gate
// above, at any tier - that gate is this function's actual safety
// property; the tier/confidence below only communicates ambiguity among
// candidates that already passed it.
export function matchFoodCandidate(itemName: string, candidates: readonly FoodCandidate[]): FoodMatchResult {
  const queryTokensRaw = tokenize(itemName)
  const queryIdentity = identityTokens(queryTokensRaw)
  const queryPrep = prepState(queryTokensRaw)

  if (queryIdentity.length === 0) {
    return { candidate: null, tier: 'unresolved', confidence: 0, warnings: ['Could not determine a food identity from the detected name.'] }
  }

  type Scored = { candidate: FoodCandidate; score: number; warnings: string[] }
  const scored: Scored[] = []
  for (const candidate of candidates) {
    const candidateTokensRaw = tokenize(candidate.name)
    const candidateIdentity = identityTokens(candidateTokensRaw)
    const candidatePrep = prepState(candidateTokensRaw)
    const result = scoreCandidate(candidateTokensRaw, candidateIdentity, queryIdentity, queryPrep, candidatePrep)
    if (!result) continue
    scored.push({ candidate, score: result.score, warnings: result.warnings })
  }

  if (scored.length === 0) {
    return { candidate: null, tier: 'unresolved', confidence: 0, warnings: [`No safe nutrition match found for "${itemName}". Nutrition match requires review.`] }
  }

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  const tiedWithBest = scored.filter(s => s.score === best.score && s.candidate.id !== best.candidate.id)

  let tier: NutritionMatchTier
  let confidence = best.score
  const warnings = [...best.warnings]

  if (tiedWithBest.length > 0) {
    // A genuine tie between distinct candidates is real ambiguity - never
    // silently pick one, even if its own score looked good in isolation.
    confidence = Math.min(confidence, 0.5)
    warnings.push(`Multiple equally plausible matches found (${[best, ...tiedWithBest].map(s => s.candidate.name).join(', ')}) - defaulted to "${best.candidate.name}", please verify.`)
  }

  if (confidence >= 0.85 && tiedWithBest.length === 0) {
    tier = 'high'
  } else if (confidence >= 0.5) {
    tier = 'medium'
  } else {
    tier = 'low'
  }

  if (tier === 'low') {
    return { candidate: null, tier: 'low', confidence, warnings: [...warnings, `Best available match ("${best.candidate.name}") was not confident enough to auto-apply. Nutrition match requires review.`] }
  }

  return { candidate: best.candidate, tier, confidence, warnings }
}
