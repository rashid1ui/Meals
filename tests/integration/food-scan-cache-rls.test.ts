// Integration test - hits the real Supabase project end to end, as actual
// authenticated users, verifying runFoodScanAnalysis's cache reuse and its
// user-scoping against real food_scan_events rows and real RLS policies
// (not just the pure selectCachedFoodScanEvent unit tests in
// lib/outsidePlan/scanAnalysis.test.ts). Deliberately NOT part of `npm
// test` (requires live credentials and mutates real rows) - run manually
// with `npm run test:food-scan-cache-rls` after populating .env.local.
// Mirrors tests/integration/supplement-tracking-rls.test.ts's own pattern.
//
// Uses a FAKE analyzer function throughout - no real Kimi API call is made
// by this test, so it costs nothing and needs no KIMI_API_KEY. It exists
// to prove the cache/event-logging round-trip against the real database
// and real RLS, which the pure unit tests (mocked Supabase) cannot cover.
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { runFoodScanAnalysis, type AnalyzeFoodImageFn } from '../../lib/outsidePlan/scanAnalysis'
import type { VisionAnalysisOutcome } from '../../lib/ai-vision/types'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:food-scan-cache-rls).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createSignedInUser(): Promise<{ client: any; userId: string; cleanup: () => Promise<void> }> {
  const email = `food-scan-cache-rls-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const password = crypto.randomUUID()

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError || !created.user) throw new Error(`Failed to create test user: ${createError?.message}`)

  const client = createClient(NEXT_PUBLIC_SUPABASE_URL!, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`Failed to sign in as test user: ${signInError.message}`)

  return { client, userId: created.user.id, cleanup: () => admin.auth.admin.deleteUser(created.user.id).then(() => undefined) }
}

const SAMPLE_RESULT = {
  isFoodPhoto: true,
  items: [{ name: 'Apple', estimatedWeightG: 150, estimatedPortionDescription: null, confidence: 0.9, notes: null }],
  overallConfidence: 0.85,
  mealDescription: null,
  warnings: [] as string[]
}

test('same user + same image reuses a valid cached result against the real database, and the analyzer is not called again', async () => {
  const user = await createSignedInUser()
  try {
    const imageBytes = Buffer.from(`test-image-${crypto.randomUUID()}`)
    let analyzeCallCount = 0
    const fakeAnalyze: AnalyzeFoodImageFn = async () => {
      analyzeCallCount++
      const outcome: VisionAnalysisOutcome = { model: 'fake-test-model', latencyMs: 42, result: SAMPLE_RESULT, error: null }
      return outcome
    }

    const first = await runFoodScanAnalysis(user.client, fakeAnalyze, {
      userId: user.userId,
      normalizedImageBytes: imageBytes,
      mimeType: 'image/jpeg',
      imageStoragePath: null
    })
    assert.strictEqual(first.outcome, 'analyzed')
    assert.strictEqual(analyzeCallCount, 1)

    const second = await runFoodScanAnalysis(user.client, fakeAnalyze, {
      userId: user.userId,
      normalizedImageBytes: imageBytes,
      mimeType: 'image/jpeg',
      imageStoragePath: null
    })
    assert.strictEqual(second.outcome, 'cached')
    assert.strictEqual(analyzeCallCount, 1, 'the analyzer must not be called again on a cache hit')
    if (second.outcome === 'cached') assert.deepStrictEqual(second.result, SAMPLE_RESULT)
  } finally {
    await user.cleanup()
  }
})

test('two different users scanning the identical image bytes never share a cached result', async () => {
  const userA = await createSignedInUser()
  const userB = await createSignedInUser()
  try {
    const sharedImageBytes = Buffer.from(`shared-test-image-${crypto.randomUUID()}`)
    let analyzeCallCount = 0
    const fakeAnalyze: AnalyzeFoodImageFn = async () => {
      analyzeCallCount++
      const outcome: VisionAnalysisOutcome = { model: 'fake-test-model', latencyMs: 42, result: SAMPLE_RESULT, error: null }
      return outcome
    }

    const forUserA = await runFoodScanAnalysis(userA.client, fakeAnalyze, {
      userId: userA.userId,
      normalizedImageBytes: sharedImageBytes,
      mimeType: 'image/jpeg',
      imageStoragePath: null
    })
    assert.strictEqual(forUserA.outcome, 'analyzed')

    // User B scans the exact same bytes - RLS scopes food_scan_events
    // reads to their own rows, and runFoodScanAnalysis's own user_id check
    // is a second layer on top of that - either way, this must be a cache
    // MISS for user B, triggering a second real analyzer call rather than
    // returning user A's result.
    const forUserB = await runFoodScanAnalysis(userB.client, fakeAnalyze, {
      userId: userB.userId,
      normalizedImageBytes: sharedImageBytes,
      mimeType: 'image/jpeg',
      imageStoragePath: null
    })
    assert.strictEqual(forUserB.outcome, 'analyzed', "user B must get a fresh analysis, never user A's cached result")
    assert.strictEqual(analyzeCallCount, 2, 'the analyzer must be called once per user for the same image bytes')
  } finally {
    await userA.cleanup()
    await userB.cleanup()
  }
})
