import test from 'node:test'
import assert from 'node:assert'
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectCachedFoodScanEvent, runFoodScanAnalysis, type AnalyzeFoodImageFn } from './scanAnalysis'
import { computeFoodScanImageHash } from './imageHash'
import type { VisionAnalysisOutcome } from '@/lib/ai-vision/types'

const NOW = new Date('2026-06-15T12:00:00Z')

const SAMPLE_RESULT = {
  isFoodPhoto: true,
  items: [{ name: 'Apple', estimatedWeightG: 150, estimatedPortionDescription: null, confidence: 0.9, notes: null }],
  overallConfidence: 0.85,
  mealDescription: null,
  warnings: [] as string[]
}

// ---- E. Pure cache-selection tests (the security-critical logic) ----

test('E. same user + same image hash reuses a valid cached result', () => {
  const candidates = [{ id: 'evt-1', user_id: 'user-a', image_hash: 'hash-1', ai_response: SAMPLE_RESULT, created_at: NOW.toISOString() }]
  const hit = selectCachedFoodScanEvent(candidates, { userId: 'user-a', imageHash: 'hash-1', ttlHours: 48, now: NOW })
  assert.ok(hit)
  assert.strictEqual(hit?.id, 'evt-1')
  assert.deepStrictEqual(hit?.result, SAMPLE_RESULT)
})

test('E. a different user can NEVER reuse another user\'s cached result, even if it somehow appears in the candidate list', () => {
  // Simulates a defense-in-depth scenario: even if the caller's query were
  // ever misconfigured and returned a foreign row, this function must
  // still refuse it - the cache-security invariant does not rely solely
  // on the SQL query being correct.
  const candidates = [{ id: 'evt-1', user_id: 'user-a', image_hash: 'hash-1', ai_response: SAMPLE_RESULT, created_at: NOW.toISOString() }]
  const hit = selectCachedFoodScanEvent(candidates, { userId: 'user-b', imageHash: 'hash-1', ttlHours: 48, now: NOW })
  assert.strictEqual(hit, null)
})

test('E. a different image hash for the same user is a miss', () => {
  const candidates = [{ id: 'evt-1', user_id: 'user-a', image_hash: 'hash-1', ai_response: SAMPLE_RESULT, created_at: NOW.toISOString() }]
  const hit = selectCachedFoodScanEvent(candidates, { userId: 'user-a', imageHash: 'hash-2', ttlHours: 48, now: NOW })
  assert.strictEqual(hit, null)
})

test('E. a row past the TTL window is not reused', () => {
  const expiredAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000).toISOString()
  const candidates = [{ id: 'evt-1', user_id: 'user-a', image_hash: 'hash-1', ai_response: SAMPLE_RESULT, created_at: expiredAt }]
  const hit = selectCachedFoodScanEvent(candidates, { userId: 'user-a', imageHash: 'hash-1', ttlHours: 48, now: NOW })
  assert.strictEqual(hit, null)
})

test('E. a row within the TTL window (just under the boundary) is reused', () => {
  const almostExpiredAt = new Date(NOW.getTime() - 47 * 60 * 60 * 1000).toISOString()
  const candidates = [{ id: 'evt-1', user_id: 'user-a', image_hash: 'hash-1', ai_response: SAMPLE_RESULT, created_at: almostExpiredAt }]
  const hit = selectCachedFoodScanEvent(candidates, { userId: 'user-a', imageHash: 'hash-1', ttlHours: 48, now: NOW })
  assert.ok(hit)
})

test('E. a row with no ai_response is never reused (a failed attempt must never be served as a success)', () => {
  const candidates = [{ id: 'evt-1', user_id: 'user-a', image_hash: 'hash-1', ai_response: null, created_at: NOW.toISOString() }]
  const hit = selectCachedFoodScanEvent(candidates, { userId: 'user-a', imageHash: 'hash-1', ttlHours: 48, now: NOW })
  assert.strictEqual(hit, null)
})

test('E. an empty candidate list is a clean miss', () => {
  const hit = selectCachedFoodScanEvent([], { userId: 'user-a', imageHash: 'hash-1', ttlHours: 48, now: NOW })
  assert.strictEqual(hit, null)
})

test('E. picks the first (most recent, per query ordering) valid match among several candidates', () => {
  const candidates = [
    { id: 'evt-newest', user_id: 'user-a', image_hash: 'hash-1', ai_response: SAMPLE_RESULT, created_at: NOW.toISOString() },
    { id: 'evt-older', user_id: 'user-a', image_hash: 'hash-1', ai_response: SAMPLE_RESULT, created_at: new Date(NOW.getTime() - 3600_000).toISOString() }
  ]
  const hit = selectCachedFoodScanEvent(candidates, { userId: 'user-a', imageHash: 'hash-1', ttlHours: 48, now: NOW })
  assert.strictEqual(hit?.id, 'evt-newest')
})

// ---- Minimal fake Supabase client for runFoodScanAnalysis orchestration tests ----

type QueryResult<T> = { data: T | null; error: { message: string } | null }

// A minimal stand-in for Supabase's thenable PostgrestFilterBuilder chain -
// only the methods runFoodScanAnalysis actually calls are implemented.
interface FakeSelectChain {
  eq: (...args: unknown[]) => FakeSelectChain
  not: (...args: unknown[]) => FakeSelectChain
  order: (...args: unknown[]) => FakeSelectChain
  limit: (...args: unknown[]) => FakeSelectChain
  then: <T>(resolve: (v: T) => void, reject: (e: unknown) => void) => void
}

function makeSelectChain(result: QueryResult<Record<string, unknown>[]>): FakeSelectChain {
  const chain: FakeSelectChain = {
    eq: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve, reject) => {
      Promise.resolve(result).then(resolve as (v: unknown) => void, reject)
    }
  }
  return chain
}

interface FakeSupabase {
  __insertedRows: Record<string, unknown>[]
  from: (table: string) => {
    select: () => FakeSelectChain
    insert: (row: Record<string, unknown>) => { select: () => { single: () => Promise<QueryResult<{ id: string }>> } }
  }
}

// runFoodScanAnalysis only ever calls .from(table).select()/.insert() on
// its `supabase` parameter - this fake implements exactly that surface and
// is cast to SupabaseClient at the boundary (real Supabase's much larger
// interface is irrelevant to what this code path actually touches).
function makeFakeSupabase(opts: { selectResult: QueryResult<Record<string, unknown>[]>; insertResult: QueryResult<{ id: string }> }): SupabaseClient & FakeSupabase {
  const insertedRows: Record<string, unknown>[] = []
  const fake: FakeSupabase = {
    __insertedRows: insertedRows,
    from: () => ({
      select: () => makeSelectChain(opts.selectResult),
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row)
        return {
          select: () => ({
            single: () => Promise.resolve(opts.insertResult)
          })
        }
      }
    })
  }
  return fake as unknown as SupabaseClient & FakeSupabase
}

const testBytes = Buffer.from('fake normalized jpeg bytes')

test('runFoodScanAnalysis: a cache hit returns the cached result and never calls the analyzer', async () => {
  // The fake's select chain doesn't actually filter by hash, so the
  // returned row's image_hash is set to match what
  // computeFoodScanImageHash produces for testBytes - selectCachedFoodScanEvent
  // re-checks this itself regardless of what the query returned.
  const realHash = computeFoodScanImageHash(testBytes)
  const supabase = makeFakeSupabase({
    selectResult: { data: [{ id: 'evt-cached', user_id: 'user-a', image_hash: realHash, ai_response: SAMPLE_RESULT, created_at: new Date().toISOString() }], error: null },
    insertResult: { data: { id: 'evt-cache-log' }, error: null }
  })

  let analyzerCalled = false
  const fakeAnalyze: AnalyzeFoodImageFn = async () => {
    analyzerCalled = true
    throw new Error('should never be called on a cache hit')
  }

  const outcome = await runFoodScanAnalysis(supabase, fakeAnalyze, {
    userId: 'user-a',
    normalizedImageBytes: testBytes,
    mimeType: 'image/jpeg',
    imageStoragePath: 'user-a/scan.jpg'
  })

  assert.strictEqual(analyzerCalled, false)
  assert.strictEqual(outcome.outcome, 'cached')
  if (outcome.outcome === 'cached') assert.deepStrictEqual(outcome.result, SAMPLE_RESULT)
})

test('runFoodScanAnalysis: a cache miss calls the analyzer and records a succeeded event', async () => {
  const supabase = makeFakeSupabase({
    selectResult: { data: [], error: null },
    insertResult: { data: { id: 'evt-new' }, error: null }
  })
  const successOutcome: VisionAnalysisOutcome = { model: 'kimi-k2.6', latencyMs: 500, result: SAMPLE_RESULT, error: null }
  const fakeAnalyze: AnalyzeFoodImageFn = async () => successOutcome

  const outcome = await runFoodScanAnalysis(supabase, fakeAnalyze, {
    userId: 'user-a',
    normalizedImageBytes: testBytes,
    mimeType: 'image/jpeg',
    imageStoragePath: 'user-a/scan.jpg'
  })

  assert.strictEqual(outcome.outcome, 'analyzed')
  if (outcome.outcome === 'analyzed') {
    assert.deepStrictEqual(outcome.result, SAMPLE_RESULT)
    assert.strictEqual(outcome.eventId, 'evt-new')
  }
  const insertedRow = supabase.__insertedRows[0]
  assert.strictEqual(insertedRow.status, 'succeeded')
  assert.strictEqual(insertedRow.ai_model, 'kimi-k2.6')
  assert.deepStrictEqual(insertedRow.ai_response, SAMPLE_RESULT)
})

test('runFoodScanAnalysis: an analyzer error is recorded with the mapped status and returned as an error outcome', async () => {
  const supabase = makeFakeSupabase({
    selectResult: { data: [], error: null },
    insertResult: { data: { id: 'evt-failed' }, error: null }
  })
  const timeoutOutcome: VisionAnalysisOutcome = { model: 'kimi-k2.6', latencyMs: 30000, result: null, error: { code: 'VISION_TIMEOUT', message: 'timed out' } }
  const fakeAnalyze: AnalyzeFoodImageFn = async () => timeoutOutcome

  const outcome = await runFoodScanAnalysis(supabase, fakeAnalyze, {
    userId: 'user-a',
    normalizedImageBytes: testBytes,
    mimeType: 'image/jpeg',
    imageStoragePath: null
  })

  assert.strictEqual(outcome.outcome, 'error')
  if (outcome.outcome === 'error') assert.strictEqual(outcome.error.code, 'VISION_TIMEOUT')
  assert.strictEqual(supabase.__insertedRows[0].status, 'timeout')
  assert.strictEqual(supabase.__insertedRows[0].ai_response, null)
})

test('runFoodScanAnalysis: a VISION_INVALID_RESPONSE error is recorded as rejected_invalid_output', async () => {
  const supabase = makeFakeSupabase({ selectResult: { data: [], error: null }, insertResult: { data: { id: 'evt-x' }, error: null } })
  const fakeAnalyze: AnalyzeFoodImageFn = async () => ({
    model: 'kimi-k2.6',
    latencyMs: 100,
    result: null,
    error: { code: 'VISION_INVALID_RESPONSE', message: 'bad json' }
  })

  await runFoodScanAnalysis(supabase, fakeAnalyze, { userId: 'user-a', normalizedImageBytes: testBytes, mimeType: 'image/jpeg', imageStoragePath: null })
  assert.strictEqual(supabase.__insertedRows[0].status, 'rejected_invalid_output')
})
