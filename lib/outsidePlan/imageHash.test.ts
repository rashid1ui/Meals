import test from 'node:test'
import assert from 'node:assert'
import { computeFoodScanImageHash } from './imageHash'

test('produces a 64-character lowercase hex SHA-256 digest', () => {
  const hash = computeFoodScanImageHash(Buffer.from('some fake jpeg bytes'))
  assert.match(hash, /^[0-9a-f]{64}$/)
})

test('is deterministic - identical bytes always hash to the same value', () => {
  const bytes = Buffer.from('identical content')
  assert.strictEqual(computeFoodScanImageHash(bytes), computeFoodScanImageHash(Buffer.from(bytes)))
})

test('different bytes hash to different values', () => {
  const a = computeFoodScanImageHash(Buffer.from('image A'))
  const b = computeFoodScanImageHash(Buffer.from('image B'))
  assert.notStrictEqual(a, b)
})

test('a single-byte difference produces a completely different hash (no partial-match leakage)', () => {
  const a = computeFoodScanImageHash(Buffer.from('almost the same bytes but not quite X'))
  const b = computeFoodScanImageHash(Buffer.from('almost the same bytes but not quite Y'))
  assert.notStrictEqual(a, b)
})
