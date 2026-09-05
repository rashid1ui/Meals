import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveFoodImage } from './resolveFood'
import type { ImageCandidate } from './types'

function pexels(alt: string, haystack = ''): ImageCandidate {
  return {
    url: 'https://images.pexels.com/photos/1/x.jpg',
    alt,
    haystack,
    attribution: {
      source: 'pexels',
      photographer: 'A. Photographer',
      photographer_url: 'https://pexels.com/@a',
      source_url: 'https://pexels.com/photo/1'
    }
  }
}

test('food -> Pexels: a confident match is stored with alt + attribution', async () => {
  const search = async () => [
    pexels('a scrabble board'),
    pexels('close-up of cooked chicken breast', '/photo/cooked-chicken-breast')
  ]
  const r = await resolveFoodImage({ name: 'Chicken Breast, Cooked' }, search)
  assert.ok(r)
  assert.equal(r!.status, 'resolved')
  assert.equal(r!.attribution.source, 'pexels')
  assert.match(r!.url, /^https:\/\/images\.pexels\.com\//)
})

test('food -> low confidence: returns null so the caller keeps the emoji fallback', async () => {
  const search = async () => [pexels('a cup of coffee'), pexels('a desk with a laptop')]
  assert.equal(await resolveFoodImage({ name: 'Black Beans, Dry' }, search), null)
})

test('food -> no results: null', async () => {
  assert.equal(await resolveFoodImage({ name: 'Honey' }, async () => []), null)
})

test('food -> falls back to a generated alt when the candidate has none', async () => {
  const search = async () => [pexels('', '/photo/grilled-salmon-fillet-seafood')]
  const r = await resolveFoodImage({ name: 'Salmon, Grilled' }, search)
  assert.ok(r)
  assert.equal(r!.alt, 'Photo of Salmon, Grilled')
})
