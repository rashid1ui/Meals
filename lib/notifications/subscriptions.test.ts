import test from 'node:test'
import assert from 'node:assert'
import { isValidPushSubscriptionInput } from './subscriptions'

test('isValidPushSubscriptionInput - accepts a well-formed PushSubscription.toJSON() shape', () => {
  assert.strictEqual(
    isValidPushSubscriptionInput({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    true
  )
})

test('isValidPushSubscriptionInput - rejects missing endpoint', () => {
  assert.strictEqual(isValidPushSubscriptionInput({ keys: { p256dh: 'x', auth: 'y' } }), false)
})

test('isValidPushSubscriptionInput - rejects an empty-string endpoint', () => {
  assert.strictEqual(isValidPushSubscriptionInput({ endpoint: '', keys: { p256dh: 'x', auth: 'y' } }), false)
})

test('isValidPushSubscriptionInput - rejects missing keys', () => {
  assert.strictEqual(isValidPushSubscriptionInput({ endpoint: 'https://push.example.com/abc' }), false)
})

test('isValidPushSubscriptionInput - rejects a partial keys object (missing auth)', () => {
  assert.strictEqual(isValidPushSubscriptionInput({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x' } }), false)
})

test('isValidPushSubscriptionInput - rejects non-object input (null, string, array)', () => {
  assert.strictEqual(isValidPushSubscriptionInput(null), false)
  assert.strictEqual(isValidPushSubscriptionInput('not-a-subscription'), false)
  assert.strictEqual(isValidPushSubscriptionInput([]), false)
})
