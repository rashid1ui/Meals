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
