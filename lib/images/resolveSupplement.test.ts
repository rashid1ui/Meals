import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSupplementImage } from './resolveSupplement'
import type { ImageCandidate } from './types'

function off(alt: string, haystack = ''): ImageCandidate {
  return {
    url: 'https://images.openfoodfacts.org/images/products/123/front.jpg',
    alt,
    haystack,
    attribution: {
      source: 'openfoodfacts',
      source_url: 'https://world.openfoodfacts.org/product/123',
      license: 'CC-BY-SA 3.0'
    }
  }
}
function pexels(alt: string): ImageCandidate {
  return { url: 'https://images.pexels.com/photos/9/x.jpg', alt, haystack: '', attribution: { source: 'pexels', photographer: 'P' } }
}

test('exact product FIRST: an Open Food Facts match wins and is marked resolved (not representative)', async () => {
  const r = await resolveSupplementImage(
    { name: 'NOW Foods Vitamin D3 5000 IU Softgels' },
    {
      searchProduct: async () => [off('NOW Foods Vitamin D3 5000 IU', 'now foods vitamins-and-supplements')],
      searchStock: async () => [pexels('generic vitamin bottle')]
    }
  )
  assert.ok(r)
  assert.equal(r!.status, 'resolved')
  assert.equal(r!.attribution.source, 'openfoodfacts')
  assert.equal(r!.attribution.is_representative, false)
  assert.equal(r!.attribution.license, 'CC-BY-SA 3.0')
})

test('no exact product -> precise representative Pexels image, marked is_representative', async () => {
  const r = await resolveSupplementImage(
    { name: 'Magnesium Glycinate' },
    {
      searchProduct: async () => [],
      searchStock: async () => [pexels('magnesium glycinate capsule supplement bottle')]
    }
  )
  assert.ok(r)
  assert.equal(r!.status, 'representative')
  assert.equal(r!.attribution.source, 'pexels')
  assert.equal(r!.attribution.is_representative, true)
})

test('neither source confident -> null (row keeps the pill icon, logged unresolved)', async () => {
  const r = await resolveSupplementImage(
    { name: 'Some Obscure Blend' },
    { searchProduct: async () => [], searchStock: async () => [pexels('a laptop on a desk')] }
  )
  assert.equal(r, null)
})

test('a weak Open Food Facts match (noun absent) does not count as exact - falls through', async () => {
  const r = await resolveSupplementImage(
    { name: 'Creatine Monohydrate' },
    {
      searchProduct: async () => [off('Chocolate protein bar', 'snacks')],
      searchStock: async () => [pexels('creatine monohydrate powder tub supplement')]
    }
  )
  assert.ok(r)
  assert.equal(r!.status, 'representative')
})

// --- F3 regression: exact-product must require strong evidence -----------
// QA found a fictional supplement ("Zzyxtrenolone Peak Recovery Blend")
// spuriously classified as an EXACT product match against an unrelated real
// product ("Meijer Pikes Peak Blend", a coffee) purely because "blend" (the
// last word of the parsed name) appeared in both. See
// lib/images/resolveSupplement.ts's isTrustworthyExactMatch.

test('F3: fictional supplement name does not exact-match an unrelated OFF product (the reported case)', async () => {
  // Real Open Food Facts response shape for this exact bug: "Meijer Pikes
  // Peak Blend" (coffee), matching only "peak" + "blend" of the 4 query
  // tokens - MEDIUM confidence (coverage 0.5), not HIGH.
  const r = await resolveSupplementImage(
    { name: 'Zzyxtrenolone Peak Recovery Blend' },
    {
      searchProduct: async () => [off('Pikes Peak Blend', 'meijer coffee')],
      searchStock: async () => []
    }
  )
  assert.equal(r, null) // no representative candidate either in this test - must not be "resolved"
})

test('F3: a MEDIUM-confidence Open Food Facts match is never classified as an exact product', async () => {
  const r = await resolveSupplementImage(
    { name: 'Zzyxtrenolone Peak Recovery Blend' },
    {
      searchProduct: async () => [off('Pikes Peak Blend', 'meijer coffee')],
      // A confident-enough representative fallback so we can see WHERE this
      // ends up, proving it never reaches 'resolved'/is_representative:false.
      searchStock: async () => [pexels('recovery blend supplement bottle')]
    }
  )
  assert.ok(r)
  assert.notEqual(r!.status, 'resolved')
  assert.equal(r!.status, 'representative')
  assert.equal(r!.attribution.is_representative, true)
})

test('F3: a HIGH-confidence match on a GENERIC word alone (no brand to corroborate) is still not exact', async () => {
  // Coverage 1.0, noun "blend" present, zero negatives -> HIGH by score.ts's
  // own tiering - but "blend" is a generic descriptor and no brand was
  // parsed from the input, so there is nothing to corroborate identity with.
  const r = await resolveSupplementImage(
    { name: 'Recovery Blend' },
    {
      searchProduct: async () => [off('Recovery Blend', 'unrelated-category')],
      searchStock: async () => [pexels('recovery blend supplement bottle')]
    }
  )
  assert.ok(r)
  assert.equal(r!.status, 'representative')
})

test('F3: a generic-word match against the WRONG brand is not exact, even at HIGH coverage', async () => {
  const r = await resolveSupplementImage(
    { name: 'NOW Foods Recovery Blend' },
    {
      // High textual coverage on "recovery blend", but the product is a
      // different brand entirely - not evidence this IS the NOW Foods item.
      searchProduct: async () => [off('Recovery Blend', 'gnc sports-nutrition')],
      searchStock: async () => [pexels('recovery blend supplement bottle')]
    }
  )
  assert.ok(r)
  assert.equal(r!.status, 'representative')
})

test('F3: a generic-word match IS accepted as exact once the parsed brand is corroborated', async () => {
  const r = await resolveSupplementImage(
    { name: 'Optimum Nutrition Gold Standard Whey Protein (24g protein/serving)' },
    {
      searchProduct: async () => [off('Gold Standard 100% Whey Protein', 'optimum nutrition sports-nutrition')],
      searchStock: async () => []
    }
  )
  assert.ok(r)
  assert.equal(r!.status, 'resolved')
  assert.equal(r!.attribution.is_representative, false)
})

test('F3: legitimate exact matches already verified live in production still resolve correctly', async () => {
  const vitaminD = await resolveSupplementImage(
    { name: 'NOW Foods Vitamin D3 5000 IU Softgels' },
    {
      searchProduct: async () => [off('NOW Foods Vitamin D3 5000 IU', 'now foods vitamins-and-supplements')],
      searchStock: async () => []
    }
  )
  assert.equal(vitaminD?.status, 'resolved')

  const magnesium = await resolveSupplementImage(
    { name: 'Magnesium Glycinate Complex' },
    {
      searchProduct: async () => [off('Swanson Magnesium glycinate', 'swanson minerals')],
      searchStock: async () => []
    }
  )
  assert.equal(magnesium?.status, 'resolved')
})
