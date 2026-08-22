import test from 'node:test'
import assert from 'node:assert'
import { classifyPushError } from './pushErrors'

test('classifyPushError - 410 Gone means remove (subscription permanently expired)', () => {
  assert.strictEqual(classifyPushError({ statusCode: 410 }), 'remove')
})

test('classifyPushError - 404 Not Found means remove (endpoint no longer exists)', () => {
  assert.strictEqual(classifyPushError({ statusCode: 404 }), 'remove')
})

test('classifyPushError - a 5xx or network error means retry, not remove', () => {
  assert.strictEqual(classifyPushError({ statusCode: 500 }), 'retry')
  assert.strictEqual(classifyPushError(new Error('network blip')), 'retry')
})

test('classifyPushError - a 400 Bad Request (malformed payload, not a dead subscription) means retry', () => {
  assert.strictEqual(classifyPushError({ statusCode: 400 }), 'retry')
})
