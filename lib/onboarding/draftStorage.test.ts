import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ONBOARDING_DRAFT_STORAGE_KEY, clearLocalOnboardingDraft } from './draftStorage'

// Node's test runner has no DOM/localStorage. A minimal in-memory fake lets
// clearLocalOnboardingDraft's real (non-early-return) branch run, proving it
// actually removes the key rather than just not-throwing.
function withFakeWindow(store: Map<string, string>, fn: () => void) {
  const fakeLocalStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    }
  }
  const g = globalThis as unknown as { window?: unknown }
  const prevWindow = g.window
  g.window = { localStorage: fakeLocalStorage }
  try {
    fn()
  } finally {
    if (prevWindow === undefined) delete g.window
    else g.window = prevWindow
  }
}

test('ONBOARDING_DRAFT_STORAGE_KEY is the single, stable key both OnboardingForm and ResetAccountButton use', () => {
  assert.equal(ONBOARDING_DRAFT_STORAGE_KEY, 'gym-meals-onboarding-draft-v1')
})

test('F1: clearLocalOnboardingDraft removes the onboarding draft key, leaving other keys untouched', () => {
  const store = new Map([
    [ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify({ step: 9, meals: 4 })],
    ['some-unrelated-key', 'keep-me']
  ])
  withFakeWindow(store, () => clearLocalOnboardingDraft())
  assert.equal(store.has(ONBOARDING_DRAFT_STORAGE_KEY), false)
  assert.equal(store.get('some-unrelated-key'), 'keep-me')
})

test('F1: clearLocalOnboardingDraft is a safe no-op when the key is already absent', () => {
  const store = new Map<string, string>()
  assert.doesNotThrow(() => withFakeWindow(store, () => clearLocalOnboardingDraft()))
  assert.equal(store.size, 0)
})

test('F1: clearLocalOnboardingDraft never throws outside a browser (no window global, e.g. SSR)', () => {
  assert.doesNotThrow(() => clearLocalOnboardingDraft())
})

test('F1: a stale draft cannot survive a reset that clears the local key - re-reading after clear finds nothing', () => {
  // Simulates the exact race the QA report described: a draft is written
  // (as OnboardingForm's autosave would), the reset clears it, and a
  // subsequent mount must find nothing left to resume from.
  const store = new Map([[ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify({ step: 9 })]])
  withFakeWindow(store, () => {
    clearLocalOnboardingDraft()
    const fakeLs = (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage
    assert.equal(fakeLs.getItem(ONBOARDING_DRAFT_STORAGE_KEY), null)
  })
})
