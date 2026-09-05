import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireQaIdentity, assertIsQaIdentity } from './identity'

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) prev[k] = process.env[k]
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('requireQaIdentity - fails closed when either var is missing', () => {
  withEnv({ QA_ACCOUNT_EMAIL: undefined, QA_ACCOUNT_USER_ID: undefined }, () => {
    assert.throws(() => requireQaIdentity(), /must both be set/)
  })
  withEnv({ QA_ACCOUNT_EMAIL: 'qa@example.com', QA_ACCOUNT_USER_ID: undefined }, () => {
    assert.throws(() => requireQaIdentity(), /must both be set/)
  })
})

test('requireQaIdentity - returns a normalised (lowercased) identity when both are set', () => {
  withEnv({ QA_ACCOUNT_EMAIL: 'QA@Example.com', QA_ACCOUNT_USER_ID: 'uuid-123' }, () => {
    const identity = requireQaIdentity()
    assert.deepEqual(identity, { email: 'qa@example.com', userId: 'uuid-123' })
  })
})

test('assertIsQaIdentity - passes only on an exact id + case-insensitive email match', () => {
  const identity = { email: 'qa@example.com', userId: 'uuid-123' }
  assert.doesNotThrow(() => assertIsQaIdentity(identity, { id: 'uuid-123', email: 'QA@Example.com' }))
})

test('assertIsQaIdentity - blocks on id mismatch (never targets a different account)', () => {
  const identity = { email: 'qa@example.com', userId: 'uuid-123' }
  assert.throws(() => assertIsQaIdentity(identity, { id: 'someone-else', email: 'qa@example.com' }), /QA operation blocked/)
})

test('assertIsQaIdentity - blocks on email mismatch even if the id happens to match', () => {
  const identity = { email: 'qa@example.com', userId: 'uuid-123' }
  assert.throws(() => assertIsQaIdentity(identity, { id: 'uuid-123', email: 'someone@else.com' }), /QA operation blocked/)
})

test('assertIsQaIdentity - blocks when the candidate has no email at all', () => {
  const identity = { email: 'qa@example.com', userId: 'uuid-123' }
  assert.throws(() => assertIsQaIdentity(identity, { id: 'uuid-123', email: null }), /QA operation blocked/)
})
