import test from 'node:test'
import assert from 'node:assert'
import webpush from 'web-push'
import { validateVapidConfig, normalizeVapidSubject } from './vapid'

// A real, valid keypair to test the happy path and the "wrong slot" cases
// against actual VAPID-shaped values, not hand-rolled strings.
const { publicKey: validPublicKey, privateKey: validPrivateKey } = webpush.generateVAPIDKeys()

// The exact malformed value class that caused the production incident this
// test guards against: a public key that is present and looks like base64url
// but does not decode to the required 65 bytes (e.g. truncated by a
// copy-paste error into an env var).
const truncatedPublicKey = validPublicKey.slice(0, -4)

test('validateVapidConfig - a genuinely valid keypair + email passes', () => {
  const result = validateVapidConfig({
    publicKey: validPublicKey,
    privateKey: validPrivateKey,
    email: 'ops@example.com'
  })
  assert.strictEqual(result.valid, true)
  assert.deepStrictEqual(result.errors, [])
})

test('validateVapidConfig - reproduces the exact production incident: a public key that decodes to the wrong byte length is rejected with a specific, actionable error', () => {
  const result = validateVapidConfig({
    publicKey: truncatedPublicKey,
    privateKey: validPrivateKey,
    email: 'ops@example.com'
  })
  assert.strictEqual(result.valid, false)
  assert.ok(
    result.errors.some(e => e.includes('NEXT_PUBLIC_VAPID_PUBLIC_KEY') && e.includes('65 bytes')),
    `expected a specific 65-byte error, got: ${result.errors.join('; ')}`
  )
})

test('validateVapidConfig - a private key with the wrong byte length is rejected', () => {
  const result = validateVapidConfig({
    publicKey: validPublicKey,
    privateKey: validPrivateKey.slice(0, -4),
    email: 'ops@example.com'
  })
  assert.strictEqual(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('VAPID_PRIVATE_KEY') && e.includes('32 bytes')))
})

test('validateVapidConfig - a swapped keypair (public/private in the wrong slots) is caught by byte length, not accepted', () => {
  // A real private key (32 bytes) placed where a 65-byte public key is
  // expected, and vice versa - a plausible real-world mistake, not just a
  // truncation.
  const result = validateVapidConfig({
    publicKey: validPrivateKey,
    privateKey: validPublicKey,
    email: 'ops@example.com'
  })
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.errors.length, 2)
})

test('validateVapidConfig - missing values are each reported individually, not just "invalid"', () => {
  const result = validateVapidConfig({})
  assert.strictEqual(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set')))
  assert.ok(result.errors.some(e => e.includes('VAPID_PRIVATE_KEY is not set')))
  assert.ok(result.errors.some(e => e.includes('VAPID_EMAIL is not set')))
})

test('validateVapidConfig - a non-base64url public key (e.g. containing spaces) is rejected as unparseable, not silently mis-decoded', () => {
  const result = validateVapidConfig({
    publicKey: 'not a real key with spaces',
    privateKey: validPrivateKey,
    email: 'ops@example.com'
  })
  assert.strictEqual(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('unparseable value')))
})

test('validateVapidConfig - an email without an @ is rejected', () => {
  const result = validateVapidConfig({
    publicKey: validPublicKey,
    privateKey: validPrivateKey,
    email: 'not-an-email'
  })
  assert.strictEqual(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('VAPID_EMAIL does not look like a valid email address')))
})

test('validateVapidConfig - VAPID_EMAIL already given as a mailto: URI is accepted (that form is valid config)', () => {
  const result = validateVapidConfig({
    publicKey: validPublicKey,
    privateKey: validPrivateKey,
    email: 'mailto:ops@example.com'
  })
  assert.strictEqual(result.valid, true)
  assert.deepStrictEqual(result.errors, [])
})

test('validateVapidConfig - a non-address is still rejected even with a mailto: prefix', () => {
  const result = validateVapidConfig({
    publicKey: validPublicKey,
    privateKey: validPrivateKey,
    email: 'mailto:not-an-email'
  })
  assert.strictEqual(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('VAPID_EMAIL does not look like a valid email address')))
})

// normalizeVapidSubject: the fix for the confirmed production incident where
// VAPID_EMAIL was stored as `mailto:user@example.com` and push.ts prepended
// another `mailto:`, producing `mailto:mailto:user@example.com`, which the
// push service rejects at send time.

test('normalizeVapidSubject - a bare address gets exactly one mailto: prefix', () => {
  assert.strictEqual(normalizeVapidSubject('ops@example.com'), 'mailto:ops@example.com')
})

test('normalizeVapidSubject - an address already prefixed with mailto: is returned unchanged (no double prefix)', () => {
  assert.strictEqual(normalizeVapidSubject('mailto:ops@example.com'), 'mailto:ops@example.com')
})

test('normalizeVapidSubject - an already double-prefixed value is collapsed to a single mailto:', () => {
  assert.strictEqual(normalizeVapidSubject('mailto:mailto:ops@example.com'), 'mailto:ops@example.com')
})

test('normalizeVapidSubject - the prefix match is case-insensitive and tolerates surrounding whitespace', () => {
  assert.strictEqual(normalizeVapidSubject('  MAILTO: ops@example.com  '), 'mailto:ops@example.com')
})

test('normalizeVapidSubject - is idempotent (normalizing its own output is a no-op)', () => {
  const once = normalizeVapidSubject('mailto:ops@example.com')
  assert.strictEqual(normalizeVapidSubject(once), once)
})
