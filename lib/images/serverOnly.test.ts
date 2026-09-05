import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..', '..')
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8')

// Modules that touch a network image API MUST be server-only, so importing
// them into a client bundle is a build error - the browser never gets
// PEXELS_API_KEY and never calls Pexels / Open Food Facts.
const SERVER_ONLY = [
  'lib/images/pexels.ts',
  'lib/images/openFoodFacts.ts',
  'lib/images/runResolve.ts',
  'lib/images/schedule.ts',
  'lib/images/sweep.ts'
]

for (const file of SERVER_ONLY) {
  test(`${file} is marked server-only`, () => {
    assert.match(read(file), /^import ['"]server-only['"]/m, `${file} must start with import 'server-only'`)
  })
}

test('the render-time reader lib/food/foodImage.ts makes no image-API calls', () => {
  const src = read('lib/food/foodImage.ts')
  assert.doesNotMatch(src, /\bfetch\s*\(/, 'foodImage.ts must not call fetch()')
  // API hosts, not the bare provider-id string (which is a valid label key).
  assert.doesNotMatch(
    src,
    /api\.pexels\.com|images\.pexels\.com|openfoodfacts\.(org|net)/i,
    'foodImage.ts must not reference an image API host'
  )
  assert.doesNotMatch(src, /['"]server-only['"]/, 'foodImage.ts must stay importable by client components')
})

test('client image components never import the resolver / network clients', () => {
  for (const file of ['components/images/StoredImageThumb.tsx', 'components/food/FoodThumb.tsx']) {
    const src = read(file)
    assert.doesNotMatch(
      src,
      /lib\/images\/(pexels|openFoodFacts|runResolve|schedule|sweep)/,
      `${file} must not import a server-only image module`
    )
  }
})
