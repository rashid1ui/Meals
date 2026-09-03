import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isStaleServerActionError } from './staleActionError'

// (1) Next's client dispatcher class name is detected on its own.
test('isStaleServerActionError - detects an UnrecognizedActionError by name', () => {
  const err = new Error('Server Action "abc123" was not found on the server.')
  err.name = 'UnrecognizedActionError'
  assert.strictEqual(isStaleServerActionError(err), true)
})

test('isStaleServerActionError - detects UnrecognizedActionError even with an unexpected message', () => {
  const err = new Error('something else entirely')
  err.name = 'UnrecognizedActionError'
  assert.strictEqual(isStaleServerActionError(err), true)
})

// (2) The client-side "was not found on the server" phrasing is detected.
test('isStaleServerActionError - detects the "was not found on the server" message', () => {
  const err = new Error(
    'Server Action "602ae655cb537c6875fd3c3e25bbbb7bdf49fbef2" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'
  )
  assert.strictEqual(isStaleServerActionError(err), true)
})

// (3) The server-side "Failed to find Server Action" phrasing is detected.
test('isStaleServerActionError - detects the "Failed to find Server Action" message', () => {
  const err = new Error(
    'Failed to find Server Action "602ae655cb537c6875fd3c3e25bbbb7bdf49fbef2". This request might be from an older or newer deployment.'
  )
  assert.strictEqual(isStaleServerActionError(err), true)
})

test('isStaleServerActionError - detects "Failed to find Server Action" with no id in the message', () => {
  const err = new Error(
    'Failed to find Server Action. This request might be from an older or newer deployment.'
  )
  assert.strictEqual(isStaleServerActionError(err), true)
})

// (4) Unrelated errors are NOT classified as stale-deployment errors.
test('isStaleServerActionError - does not match a generic network error', () => {
  assert.strictEqual(
    isStaleServerActionError(new Error('NetworkError when attempting to fetch resource.')),
    false
  )
  assert.strictEqual(isStaleServerActionError(new TypeError('Failed to fetch')), false)
})

test('isStaleServerActionError - does not match an unrelated "not found on the server" message', () => {
  // No "Server Action" in the text -> must not be treated as deployment skew.
  assert.strictEqual(
    isStaleServerActionError(new Error('The requested page was not found on the server')),
    false
  )
})

test('isStaleServerActionError - does not match non-Error values', () => {
  assert.strictEqual(isStaleServerActionError(null), false)
  assert.strictEqual(isStaleServerActionError(undefined), false)
  assert.strictEqual(
    isStaleServerActionError('Server Action "x" was not found on the server.'),
    false
  )
  assert.strictEqual(isStaleServerActionError({ message: 'Failed to find Server Action' }), false)
  assert.strictEqual(isStaleServerActionError({ error: 'Failed to save diet plan.' }), false)
})

// (5) Normal manual-plan errors keep their existing (non-stale) behavior -
// these are the real strings createManualDietPlan / saveMealReminders return
// or throw, and none of them should route to the reload-recovery UI.
test('isStaleServerActionError - normal manual meal-plan errors are not classified as stale', () => {
  const normalErrors = [
    'Not authenticated',
    'Failed to save diet plan.',
    'Failed to save meals. Rolling back.',
    'You already have an active meal plan. Refresh the page to go to your Dashboard, or use Settings > Generate New Plan if you want to replace it.',
    'One or more selected foods are inactive or no longer exist. Please refresh and try again.',
    'Your plan was saved, but we could not save your reminder times. You can set them later in Settings.',
    'Failed to save your meal plan.',
    'Failed to save your reminders.'
  ]
  for (const message of normalErrors) {
    assert.strictEqual(isStaleServerActionError(new Error(message)), false, message)
  }
})

// (6) The recovery UI in OnboardingForm wires the detector to a dedicated
// "App Updated" card that offers "Reload & Continue" and does a full page
// reload (not an automatic one). Asserted against source text so the guard
// needs no React render harness (the project's tests are plain node:test).
test('OnboardingForm renders the stale-action recovery card, not "Generation Failed"', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../app/onboarding/OnboardingForm.tsx', import.meta.url)),
    'utf8'
  )

  // Detector is imported and used to branch on the stale case.
  assert.ok(source.includes("from '@/lib/actions/staleActionError'"))
  assert.ok(source.includes('isStaleServerActionError(err)'))
  assert.ok(source.includes("setPhase('stale')"))

  // Required recovery copy + primary action.
  assert.ok(source.includes('App Updated'))
  assert.ok(source.includes('The app was updated while you were working. Reload to continue.'))
  assert.ok(source.includes('Reload &amp; Continue'))

  // Full-page reload, invoked only from the button's onClick (never automatically).
  assert.ok(source.includes('window.location.reload()'))
  assert.ok(source.includes('onClick={handleReloadAfterUpdate}'))

  // Every vulnerable manual-flow action routes here: create-plan, reminders,
  // and supplements (all three POST a server action from this same wizard).
  const staleBranches = source.match(/if \(isStaleServerActionError\(err\)\) \{/g) ?? []
  assert.strictEqual(staleBranches.length, 3, 'expected stale handling in all three manual submit handlers')
})
