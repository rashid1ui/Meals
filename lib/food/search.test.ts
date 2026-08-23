import test from 'node:test'
import assert from 'node:assert'
import { matchesFoodQuery, searchFoods } from './search'

const CATALOG = [
  { name: 'Banana, Raw', category: 'fruit' },
  { name: 'Chicken Breast, Raw', category: 'protein' },
  { name: 'Chicken Thigh, Raw', category: 'protein' },
  { name: 'Limitless Whey Protein (25g protein/serving)', category: 'supplement' },
  { name: 'optimum nutrition Creatine (5g/serving)', category: 'supplement' },
  { name: 'Broccoli, Raw', category: 'vegetable' },
  { name: 'White Rice, Dry', category: 'carbohydrate' }
]

test('search finds banana', () => {
  const results = searchFoods(CATALOG, 'banana')
  assert.ok(results.some(f => f.name === 'Banana, Raw'))
})

test('search finds chicken-related foods', () => {
  const results = searchFoods(CATALOG, 'chicken')
  const names = results.map(f => f.name)
  assert.ok(names.includes('Chicken Breast, Raw'))
  assert.ok(names.includes('Chicken Thigh, Raw'))
})

test('search finds whey products', () => {
  const results = searchFoods(CATALOG, 'whey')
  assert.ok(results.some(f => f.name.includes('Whey Protein')))
})

test('search for "protein" finds relevant protein foods/products (name and category match)', () => {
  const results = searchFoods(CATALOG, 'protein')
  const names = results.map(f => f.name)
  assert.ok(names.includes('Chicken Breast, Raw'), 'category=protein should match')
  assert.ok(names.includes('Limitless Whey Protein (25g protein/serving)'), 'name containing "protein" should match')
})

test('search is case-insensitive', () => {
  assert.deepStrictEqual(searchFoods(CATALOG, 'BANANA'), searchFoods(CATALOG, 'banana'))
  assert.deepStrictEqual(searchFoods(CATALOG, 'ChIcKeN'), searchFoods(CATALOG, 'chicken'))
})

test('search trims whitespace', () => {
  assert.deepStrictEqual(searchFoods(CATALOG, '  banana  '), searchFoods(CATALOG, 'banana'))
})

test('empty query matches everything', () => {
  assert.strictEqual(searchFoods(CATALOG, '').length, CATALOG.length)
  assert.strictEqual(searchFoods(CATALOG, '   ').length, CATALOG.length)
})

test('category synonym "veggies" reaches the vegetable category', () => {
  const results = searchFoods(CATALOG, 'veggies')
  assert.ok(results.some(f => f.name === 'Broccoli, Raw'))
})

test('no match for an unrelated query', () => {
  assert.strictEqual(searchFoods(CATALOG, 'xyz-not-a-food').length, 0)
})

test('matchesFoodQuery matches a single food directly', () => {
  assert.strictEqual(matchesFoodQuery({ name: 'Banana, Raw', category: 'fruit' }, 'banana'), true)
  assert.strictEqual(matchesFoodQuery({ name: 'Banana, Raw', category: 'fruit' }, 'chicken'), false)
})
