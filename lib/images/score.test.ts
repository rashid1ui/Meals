import { test } from 'node:test'
import assert from 'node:assert/strict'
import { queryTokens, scoreCandidate, pickBest } from './score'
import type { ImageCandidate } from './types'

function candidate(alt: string, haystack = ''): ImageCandidate {
  return { url: 'https://images.pexels.com/x.jpg', alt, haystack, attribution: { source: 'pexels' } }
}

test('queryTokens - drops stopwords and short tokens', () => {
  assert.deepEqual(queryTokens('cooked chicken breast'), ['cooked', 'chicken', 'breast'])
  assert.deepEqual(queryTokens('a raw fresh food of the salmon'), ['salmon'])
})

test('scoreCandidate - HIGH when the noun is present, coverage high, no negatives', () => {
  const s = scoreCandidate(candidate('Close-up of cooked chicken breast on a plate'), ['cooked', 'chicken', 'breast'], 'breast')
  assert.equal(s.tier, 'HIGH')
  assert.ok(s.nounHit)
  assert.equal(s.neg, 0)
})

test('scoreCandidate - LOW when the required noun is absent', () => {
  const s = scoreCandidate(candidate('A bowl of coffee beans'), ['black', 'beans'], 'beans')
  const s2 = scoreCandidate(candidate('A cup of coffee'), ['black', 'beans'], 'beans')
  assert.equal(s2.tier, 'LOW')
  assert.ok(!s2.nounHit)
  assert.ok(s.score >= s2.score)
})

test('scoreCandidate - scene/person negatives push the tier down', () => {
  const clean = scoreCandidate(candidate('grilled salmon fillet'), ['grilled', 'salmon'], 'salmon')
  const withPerson = scoreCandidate(candidate('a woman eating grilled salmon in a restaurant'), ['grilled', 'salmon'], 'salmon')
  assert.equal(clean.tier, 'HIGH')
  assert.ok(withPerson.neg >= 2)
  assert.notEqual(withPerson.tier, 'HIGH')
})

test('pickBest - never returns the first candidate blindly; picks the best-scoring one', () => {
  const candidates = [
    candidate('a scrabble board with letters spelling oats'),
    candidate('bowl of rolled oats porridge', '/photo/rolled-oats-breakfast'),
    candidate('sunset over an oat field farm')
  ]
  const best = pickBest(candidates, 'rolled oats', 'oats')
  assert.ok(best)
  assert.equal(best!.candidate.alt, 'bowl of rolled oats porridge')
})

test('pickBest - returns null when nothing clears LOW', () => {
  const candidates = [candidate('a cup of coffee'), candidate('a laptop on a desk')]
  assert.equal(pickBest(candidates, 'black beans', 'beans'), null)
  assert.equal(pickBest([], 'anything', 'thing'), null)
})
