import test from 'node:test'
import assert from 'node:assert'
import webpush from 'web-push'
import {
  runSubscribe,
  urlBase64ToUint8Array,
  SUBSCRIBE_ERRORS,
  GENERIC_SUBSCRIBE_ERROR,
  type PushEnvironment,
  type PushRegistrationLike
} from './pushSubscribe'
import type { PushSubscriptionInput } from './subscriptions'

// A real, correctly-shaped VAPID public key (base64url, decodes to 65 bytes).
const { publicKey: validVapidPublicKey } = webpush.generateVAPIDKeys()

const sampleSubscription: PushSubscriptionInput = {
  endpoint: 'https://push.example.com/sub/abc123',
  keys: { p256dh: 'p256dh-key-value', auth: 'auth-key-value' }
}

// runSubscribe console.error's every failure path (by design - the bug being
// fixed was silent failure). Silence it per-test so the suite output stays
// readable, and hand back a restore fn.
function silenceConsoleError(): () => void {
  const original = console.error
  console.error = () => {}
  return () => {
    console.error = original
  }
}

// Builds a registration fake. `onSubscribe` lets a test assert the options
// runSubscribe passes, or throw to simulate a rejection. If `existing` is
// provided, getSubscription resolves to it and subscribe must not be called.
function fakeRegistration(opts: {
  existing?: { toJSON: () => PushSubscriptionInput } | null
  onSubscribe?: (options: { userVisibleOnly: true; applicationServerKey: Uint8Array }) => void
  subscribeResult?: PushSubscriptionInput
}): { registration: PushRegistrationLike; subscribeCalls: number } {
  const state = { subscribeCalls: 0 }
  const registration: PushRegistrationLike = {
    getSubscription: async () => opts.existing ?? null,
    subscribe: async options => {
      state.subscribeCalls++
      opts.onSubscribe?.(options)
      return { toJSON: () => opts.subscribeResult ?? sampleSubscription }
    }
  }
  return {
    registration,
    get subscribeCalls() {
      return state.subscribeCalls
    }
  }
}

function baseEnv(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  const { registration } = fakeRegistration({})
  return {
    supported: true,
    vapidPublicKey: validVapidPublicKey,
    registerAndReady: async () => registration,
    persist: async () => ({ data: undefined }),
    ...overrides
  }
}

test('urlBase64ToUint8Array - a real VAPID public key decodes to exactly 65 bytes', () => {
  assert.strictEqual(urlBase64ToUint8Array(validVapidPublicKey).byteLength, 65)
})

test('runSubscribe - unsupported browser: returns a clear error, never touches the service worker or persistence', async () => {
  const restore = silenceConsoleError()
  let registerCalled = false
  let persistCalled = false
  const result = await runSubscribe(
    baseEnv({
      supported: false,
      registerAndReady: async () => {
        registerCalled = true
        throw new Error('should not be called')
      },
      persist: async () => {
        persistCalled = true
        return { data: undefined }
      }
    })
  )
  restore()
  assert.deepStrictEqual(result, { ok: false, error: SUBSCRIBE_ERRORS.unsupported })
  assert.strictEqual(registerCalled, false)
  assert.strictEqual(persistCalled, false)
})

test('runSubscribe - missing NEXT_PUBLIC_VAPID_PUBLIC_KEY: returns "not configured", never subscribes or persists', async () => {
  const restore = silenceConsoleError()
  let persistCalled = false
  const result = await runSubscribe(
    baseEnv({
      vapidPublicKey: undefined,
      persist: async () => {
        persistCalled = true
        return { data: undefined }
      }
    })
  )
  restore()
  assert.deepStrictEqual(result, { ok: false, error: SUBSCRIBE_ERRORS.notConfigured })
  assert.strictEqual(persistCalled, false)
})

test('runSubscribe - empty-string VAPID key is treated as missing', async () => {
  const restore = silenceConsoleError()
  const result = await runSubscribe(baseEnv({ vapidPublicKey: '' }))
  restore()
  assert.deepStrictEqual(result, { ok: false, error: SUBSCRIBE_ERRORS.notConfigured })
})

test('runSubscribe - a VAPID key that is not valid base64url: returns "misconfigured", does not reach the service worker', async () => {
  const restore = silenceConsoleError()
  let registerCalled = false
  const result = await runSubscribe(
    baseEnv({
      vapidPublicKey: 'not a real key !!! with spaces',
      registerAndReady: async () => {
        registerCalled = true
        throw new Error('should not be reached')
      }
    })
  )
  restore()
  assert.deepStrictEqual(result, { ok: false, error: SUBSCRIBE_ERRORS.misconfiguredKey })
  assert.strictEqual(registerCalled, false)
})

test('runSubscribe - a base64url VAPID key of the wrong byte length: returns "misconfigured"', async () => {
  const restore = silenceConsoleError()
  // Valid base64url, but decodes to far fewer than 65 bytes.
  const result = await runSubscribe(baseEnv({ vapidPublicKey: 'QUJDREVG' }))
  restore()
  assert.deepStrictEqual(result, { ok: false, error: SUBSCRIBE_ERRORS.misconfiguredKey })
})

test('runSubscribe - service worker registration failure: returns the service-worker error, never persists', async () => {
  const restore = silenceConsoleError()
  let persistCalled = false
  const result = await runSubscribe(
    baseEnv({
      registerAndReady: async () => {
        throw new Error('SecurityError: failed to register a ServiceWorker')
      },
      persist: async () => {
        persistCalled = true
        return { data: undefined }
      }
    })
  )
  restore()
  assert.deepStrictEqual(result, { ok: false, error: SUBSCRIBE_ERRORS.serviceWorker })
  assert.strictEqual(persistCalled, false)
})

test('runSubscribe - pushManager.subscribe rejects: returns the generic error, never persists', async () => {
  const restore = silenceConsoleError()
  let persistCalled = false
  const { registration } = fakeRegistration({
    onSubscribe: () => {
      throw new Error('AbortError: Registration failed - push service error')
    }
  })
  const result = await runSubscribe(
    baseEnv({
      registerAndReady: async () => registration,
      persist: async () => {
        persistCalled = true
        return { data: undefined }
      }
    })
  )
  restore()
  assert.deepStrictEqual(result, { ok: false, error: GENERIC_SUBSCRIBE_ERROR })
  assert.strictEqual(persistCalled, false)
})

test('runSubscribe - pushManager.subscribe rejects with NotAllowedError: returns the permission-blocked message', async () => {
  const restore = silenceConsoleError()
  const notAllowed = new Error('Permission denied')
  notAllowed.name = 'NotAllowedError'
  const { registration } = fakeRegistration({
    onSubscribe: () => {
      throw notAllowed
    }
  })
  const result = await runSubscribe(baseEnv({ registerAndReady: async () => registration }))
  restore()
  assert.deepStrictEqual(result, { ok: false, error: SUBSCRIBE_ERRORS.permissionBlocked })
})

test('runSubscribe - happy path: subscribes with userVisibleOnly + a 65-byte key, persists the toJSON payload, returns ok', async () => {
  let seenOptions: { userVisibleOnly: boolean; keyBytes: number } | null = null
  let persistedWith: PushSubscriptionInput | null = null
  const created: PushSubscriptionInput = {
    endpoint: 'https://push.example.com/sub/happy',
    keys: { p256dh: 'p', auth: 'a' }
  }
  const { registration } = fakeRegistration({
    existing: null,
    subscribeResult: created,
    onSubscribe: options => {
      seenOptions = {
        userVisibleOnly: options.userVisibleOnly,
        keyBytes: options.applicationServerKey.byteLength
      }
    }
  })
  const result = await runSubscribe(
    baseEnv({
      registerAndReady: async () => registration,
      persist: async input => {
        persistedWith = input
        return { data: undefined }
      }
    })
  )
  assert.deepStrictEqual(result, { ok: true })
  assert.deepStrictEqual(seenOptions, { userVisibleOnly: true, keyBytes: 65 })
  assert.deepStrictEqual(persistedWith, created)
})

test('runSubscribe - reuses an existing browser subscription: does not call subscribe(), still persists it', async () => {
  const existingPayload: PushSubscriptionInput = {
    endpoint: 'https://push.example.com/sub/existing',
    keys: { p256dh: 'ep', auth: 'ea' }
  }
  const reg = fakeRegistration({
    existing: { toJSON: () => existingPayload }
  })
  let persistedWith: PushSubscriptionInput | null = null
  const result = await runSubscribe(
    baseEnv({
      registerAndReady: async () => reg.registration,
      persist: async input => {
        persistedWith = input
        return { data: undefined }
      }
    })
  )
  assert.deepStrictEqual(result, { ok: true })
  assert.strictEqual(reg.subscribeCalls, 0)
  assert.deepStrictEqual(persistedWith, existingPayload)
})

test('runSubscribe - persistence (savePushSubscription) failure propagates its safe message and reports not-ok', async () => {
  const restore = silenceConsoleError()
  const result = await runSubscribe(
    baseEnv({
      persist: async () => ({ error: 'Failed to save push subscription.' })
    })
  )
  restore()
  assert.deepStrictEqual(result, { ok: false, error: 'Failed to save push subscription.' })
})

test('runSubscribe - "not fully configured on the server" from persist is surfaced verbatim (no secret leakage, no swallow)', async () => {
  const restore = silenceConsoleError()
  const serverMsg = 'Push notifications are not fully configured on the server.'
  const result = await runSubscribe(baseEnv({ persist: async () => ({ error: serverMsg }) }))
  restore()
  assert.deepStrictEqual(result, { ok: false, error: serverMsg })
})
