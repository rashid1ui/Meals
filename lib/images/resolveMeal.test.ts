import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMealImage } from './resolveMeal'
import type { ImageCandidate } from './types'

function pexels(alt: string, haystack = ''): ImageCandidate {
  return { url: 'https://images.pexels.com/photos/2/x.jpg', alt, haystack, attribution: { source: 'pexels', photographer: 'P' } }
}

test('meal -> query is built from the ACTUAL foods, biggest contributor first', async () => {
  let seen = ''
  const search = async (q: string) => {
    seen = q
    return [pexels('grilled chicken and rice plate', '/photo/chicken-rice-broccoli-meal')]
  }
  const r = await resolveMealImage(
    { name: 'Lunch' },
    [
      { foodDatabaseId: null, name: 'Broccoli', calories: 45 },
      { foodDatabaseId: null, name: 'Grilled Chicken', calories: 320 },
      { foodDatabaseId: null, name: 'White Rice', calories: 210 }
    ],
    search
  )
  assert.ok(seen.startsWith('chicken'))
  assert.ok(seen.includes('rice'))
  assert.ok(r)
  assert.equal(r!.status, 'representative')
  assert.equal(r!.attribution.is_representative, true)
})

test('meal -> no foods: null', async () => {
  assert.equal(await resolveMealImage({ name: 'Snack' }, [], async () => [pexels('x')]), null)
})

test('meal -> low confidence: null, meal keeps its emoji tile', async () => {
  const r = await resolveMealImage(
    { name: 'Snack' },
    [{ foodDatabaseId: null, name: 'Greek Yogurt', calories: 120 }],
    async () => [pexels('a person using a laptop in a cafe')]
  )
  assert.equal(r, null)
})
