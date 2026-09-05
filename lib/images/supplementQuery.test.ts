import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSupplementName,
  supplementKey,
  buildProductSearchTerms,
  buildSupplementPexelsQuery,
  supplementNoun
} from './supplementQuery'

test('parseSupplementName - brand + product + dose + form', () => {
  const p = parseSupplementName('NOW Foods Vitamin D3 5000 IU Softgels')
  assert.equal(p.brand, 'now foods')
  assert.equal(p.dose, '5000 iu')
  assert.equal(p.form, 'softgel')
  assert.ok(p.product.includes('vitamin') && p.product.includes('d3'))
})

test('parseSupplementName - plain product, no brand/dose/form', () => {
  const p = parseSupplementName('Creatine Monohydrate')
  assert.equal(p.brand, null)
  assert.equal(p.dose, null)
  assert.equal(p.form, null)
  assert.equal(p.product, 'creatine monohydrate')
})

test('parseSupplementName - strips parenthetical notes and serving tail', () => {
  const p = parseSupplementName('Whey Protein (Gold Standard) - 24g protein per scoop')
  assert.ok(!p.product.includes('gold'))
  assert.ok(p.product.includes('whey') && p.product.includes('protein'))
})

test('buildProductSearchTerms - most specific first for Open Food Facts', () => {
  const p = parseSupplementName('Nordic Naturals Omega-3 1000mg')
  const terms = buildProductSearchTerms(p)
  assert.ok(terms.startsWith('nordic naturals'))
  assert.ok(terms.includes('omega'))
  assert.ok(terms.includes('1000 mg'))
})

test('buildSupplementPexelsQuery - describes the physical object, never a bare label', () => {
  const q = buildSupplementPexelsQuery(parseSupplementName('Vitamin C 1000mg tablets'))
  assert.ok(q.includes('vitamin'))
  assert.ok(q.includes('supplement'))
  assert.ok(!/^tablet supplement bottle$/.test(q))
})

test('supplementKey - stable, normalised identity; dose distinguishes', () => {
  const a = supplementKey(parseSupplementName('NOW Foods Vitamin D3 5000 IU'))
  const b = supplementKey(parseSupplementName('now foods   vitamin d3   5000 iu'))
  const c = supplementKey(parseSupplementName('NOW Foods Vitamin D3 2000 IU'))
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('supplementNoun - last meaningful product word is the visual anchor', () => {
  assert.equal(supplementNoun(parseSupplementName('Magnesium Glycinate')), 'glycinate')
  assert.equal(supplementNoun(parseSupplementName('Creatine Monohydrate Powder')), 'monohydrate')
})
