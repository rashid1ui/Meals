// Pure parsing + query generation for supplement / vitamin images.
// No Supabase, no network, no React.
//
// A supplement name is free text ("NOW Foods Vitamin D3 5000 IU Softgels",
// "Creatine Monohydrate", "Omega-3 Fish Oil 1000mg"). This module pulls it
// apart into { brand, product, form, dose } so the resolver can:
//   1. build precise Open Food Facts product-search terms (exact product first)
//   2. build a precise REPRESENTATIVE Pexels query as a fallback - never the
//      bare label ("Snack", "Vitamin") which returns generic/unrelated shots
//   3. derive the visual-anchor noun the scorer requires to appear in a
//      candidate photo (spec section 5).

const FORMS = [
  'softgel', 'soft gel', 'capsule', 'caplet', 'tablet', 'gummy', 'gummies',
  'powder', 'liquid', 'drops', 'drop', 'lozenge', 'chewable', 'scoop',
  'effervescent', 'sachet', 'spray'
]

// Best-effort brand list - matched as a leading or standalone token. Missing
// a brand only means we skip the brand term; it never blocks resolution.
const BRANDS = [
  'now foods', 'now', 'optimum nutrition', 'nature made', 'naturemade',
  'nordic naturals', 'thorne', 'garden of life', "doctor's best", 'doctors best',
  'jarrow', 'solgar', 'life extension', 'kirkland', 'centrum', 'myprotein',
  'my protein', 'limitless', 'bulk', 'bulksupplements', 'cellucor', 'muscletech',
  'ghost', 'transparent labs', 'legion', 'pure encapsulations', 'nutricost',
  'sports research', 'natures bounty', "nature's bounty", 'vitafusion', 'olly',
  'ritual', 'onnit', 'gnc', 'holland barrett', 'nutrabio'
]

const DOSE_UNITS = ['mg', 'mcg', 'ug', 'µg', 'g', 'iu', 'ml', 'billion cfu', 'cfu']

// Words that carry no visual meaning for a product photo.
const NOISE = new Set([
  'the', 'a', 'and', 'with', 'plus', 'high', 'strength', 'potency', 'extra',
  'daily', 'complex', 'formula', 'supplement', 'supplements', 'dietary',
  'per', 'serving', 'servings', 'count', 'ct', 'pack', 'value', 'size',
  'for', 'of', 'support', 'advanced', 'premium', 'pure', 'natural'
])

export type ParsedSupplement = {
  raw: string
  brand: string | null
  product: string
  form: string | null
  dose: string | null // e.g. "5000 iu", "1000 mg"
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function parseSupplementName(name: string): ParsedSupplement {
  const raw = name.trim()
  // Drop parenthetical / bracketed notes ("(Gold Standard)", "[120 scoops]")
  // and everything after a " - " / " / " serving descriptor tail.
  let work = raw
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s[-/]\s.*$/, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  // dose: number + unit
  let dose: string | null = null
  const doseRe = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s?(${DOSE_UNITS.join('|').replace(/ /g, '\\s?')})\\b`, 'i')
  const doseMatch = work.match(doseRe)
  if (doseMatch) {
    const unit = doseMatch[2].toLowerCase().replace(/\s+/g, ' ')
    dose = `${doseMatch[1]} ${unit}`
    work = work.replace(doseMatch[0], ' ')
  }

  // form
  let form: string | null = null
  for (const f of FORMS) {
    const re = new RegExp(`\\b${f}s?\\b`, 'i')
    if (re.test(work)) {
      form = f
      work = work.replace(re, ' ')
      break
    }
  }

  // brand (longest match wins so "now foods" beats "now")
  let brand: string | null = null
  const sortedBrands = [...BRANDS].sort((a, b) => b.length - a.length)
  for (const b of sortedBrands) {
    const re = new RegExp(`(^|\\b)${b.replace(/[^a-z0-9 ]/g, '\\$&')}(\\b|$)`, 'i')
    if (re.test(work)) {
      brand = b
      work = work.replace(re, ' ')
      break
    }
  }

  // product = the meaningful remainder
  const productWords = work
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9+-]/g, ''))
    .filter(w => w.length > 1 && !NOISE.has(w) && !/^\d+%?$/.test(w))
  const product = productWords.join(' ').trim() || raw.toLowerCase().trim()

  return { raw, brand, product, form, dose }
}

// Normalised identity key - used by overrides.ts and for de-dup logging.
export function supplementKey(parsed: ParsedSupplement): string {
  return [slug(parsed.product), parsed.brand ? slug(parsed.brand) : '', parsed.dose ? slug(parsed.dose) : '']
    .join('|')
}

// Terms for the Open Food Facts product search - brand + product + dose,
// most specific first. OFF ranks a good name match highly.
export function buildProductSearchTerms(parsed: ParsedSupplement): string {
  return [parsed.brand, parsed.product, parsed.dose].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

// Precise REPRESENTATIVE Pexels query when no exact product photo exists.
// Deliberately describes the physical object, never the meal-slot label.
export function buildSupplementPexelsQuery(parsed: ParsedSupplement): string {
  const form = parsed.form ?? 'capsule'
  return `${parsed.product} ${form} supplement bottle`.replace(/\s+/g, ' ').trim().toLowerCase()
}

// The single most identifying word the scorer requires in a candidate photo.
export function supplementNoun(parsed: ParsedSupplement): string {
  const words = parsed.product.split(/\s+/).filter(w => w.length > 2 && !NOISE.has(w))
  return words[words.length - 1] ?? parsed.product.trim()
}
