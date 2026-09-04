import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFoodImageQuery,
  deriveFoodImageQuery,
  primaryFoodNoun,
  FOOD_IMAGE_QUERY_OVERRIDES
} from './foodImageQuery'

test('deriveFoodImageQuery - preserves cooking state and cut, qualifier leads', () => {
  assert.equal(deriveFoodImageQuery('Chicken Breast, Cooked'), 'cooked chicken breast')
  assert.equal(deriveFoodImageQuery('Chicken Thigh, Raw'), 'raw chicken thigh')
  assert.equal(deriveFoodImageQuery('Sweet Potato, Baked'), 'baked sweet potato')
  assert.equal(deriveFoodImageQuery('Salmon, Grilled'), 'grilled salmon')
  assert.equal(deriveFoodImageQuery('Beef, Lean, Cooked'), 'cooked lean beef')
})

test('deriveFoodImageQuery - a name with no comma is used almost verbatim', () => {
  assert.equal(deriveFoodImageQuery('Whole Milk'), 'whole milk')
  assert.equal(deriveFoodImageQuery('Cheddar Cheese'), 'cheddar cheese')
  assert.equal(deriveFoodImageQuery('Honey'), 'honey')
})

test('deriveFoodImageQuery - drops only nutrition-basis noise, never the food itself', () => {
  assert.equal(deriveFoodImageQuery('Rolled Oats, Dry'), 'rolled oats')
  assert.equal(deriveFoodImageQuery('Brown Rice, Dry'), 'brown rice')
  assert.equal(deriveFoodImageQuery('Lean Ground Beef 93/7, Raw'), 'raw lean ground beef')
  assert.equal(deriveFoodImageQuery('Cottage Cheese, Lowfat 2%'), 'cottage cheese')
  assert.equal(deriveFoodImageQuery('2% Milk'), 'milk')
  assert.equal(deriveFoodImageQuery('Tuna, Light, Canned in Water'), 'canned tuna')
  assert.equal(deriveFoodImageQuery('Butter, Unsalted'), 'butter')
})

test('deriveFoodImageQuery - output is always lowercase, single-spaced, comma-free', () => {
  for (const name of [
    'Chicken Breast, Cooked', 'Whole Wheat Pasta, Dry', 'Bison, Ground, Raw',
    'Mixed Vegetables, Frozen', 'Egg Whites, Raw', '  Spinach ,  Raw '
  ]) {
    const q = deriveFoodImageQuery(name)
    assert.ok(q.length > 0, `empty for ${name}`)
    assert.equal(q, q.toLowerCase())
    assert.ok(!q.includes(','), `comma leaked for ${name}`)
    assert.ok(!/\s{2,}/.test(q), `double space for ${name}`)
    assert.ok(!/\d\/\d/.test(q), `ratio leaked for ${name}`)
  }
})

test('deriveFoodImageQuery - never returns an empty string even for an all-noise name', () => {
  assert.ok(deriveFoodImageQuery('2%').length > 0)
})

test('buildFoodImageQuery - uses an override only for the few brand / alias names', () => {
  assert.equal(buildFoodImageQuery('Cerelac'), 'baby cereal porridge bowl')
  assert.equal(buildFoodImageQuery('optimum nutrition Creatine (5g/serving)'), 'creatine monohydrate powder')
  assert.equal(buildFoodImageQuery('Flour Tortilla / Wrap'), 'stack of flour tortillas')
  // A normal name is derived, not overridden.
  assert.equal(buildFoodImageQuery('Banana, Raw'), deriveFoodImageQuery('Banana, Raw'))
  assert.ok(!('Banana, Raw' in FOOD_IMAGE_QUERY_OVERRIDES))
})

test('buildFoodImageQuery - trims surrounding whitespace before matching', () => {
  assert.equal(buildFoodImageQuery('  Cerelac  '), FOOD_IMAGE_QUERY_OVERRIDES['Cerelac'])
})

test('primaryFoodNoun - the last meaningful word of the base is the required visual anchor', () => {
  assert.equal(primaryFoodNoun('Chicken Breast, Cooked'), 'breast')
  assert.equal(primaryFoodNoun('Brown Rice, Dry'), 'rice')
  assert.equal(primaryFoodNoun('Black Beans, Dry'), 'beans')
  assert.equal(primaryFoodNoun('Lean Ground Beef 93/7, Raw'), 'beef')
  assert.equal(primaryFoodNoun('Honey'), 'honey')
  assert.equal(primaryFoodNoun('2% Milk'), 'milk')
})

test('every override entry is a non-empty, comma-free, lowercase phrase', () => {
  for (const [name, query] of Object.entries(FOOD_IMAGE_QUERY_OVERRIDES)) {
    assert.ok(query.trim().length > 0, `empty override for ${name}`)
    assert.ok(!query.includes(','), `comma in override for ${name}`)
    assert.equal(query, query.toLowerCase(), `override not lowercase for ${name}`)
  }
})
