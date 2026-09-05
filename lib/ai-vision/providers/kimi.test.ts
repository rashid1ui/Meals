import test from 'node:test'
import assert from 'node:assert'
import { kimiVisionProvider } from './kimi'

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_KIMI_API_KEY = process.env.KIMI_API_KEY
const ORIGINAL_KIMI_VISION_MODEL = process.env.KIMI_VISION_MODEL

function restoreEnv() {
  if (ORIGINAL_KIMI_API_KEY === undefined) delete process.env.KIMI_API_KEY
  else process.env.KIMI_API_KEY = ORIGINAL_KIMI_API_KEY
  if (ORIGINAL_KIMI_VISION_MODEL === undefined) delete process.env.KIMI_VISION_MODEL
  else process.env.KIMI_VISION_MODEL = ORIGINAL_KIMI_VISION_MODEL
  global.fetch = ORIGINAL_FETCH
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function chatCompletionBody(contentObject: unknown) {
  return { choices: [{ message: { content: JSON.stringify(contentObject) } }] }
}

const VALID_ANALYSIS = {
  is_food_photo: true,
  items: [{ name: 'Apple', estimated_weight_g: 150, estimated_portion_description: 'one medium apple', confidence: 0.9, notes: null }],
  overall_confidence: 0.85,
  meal_description: 'A single apple',
  warnings: []
}

const testImage = { imageBuffer: Buffer.from('fake-jpeg-bytes'), mimeType: 'image/jpeg' }

test('A. isConfigured() is false when KIMI_API_KEY is missing', () => {
  delete process.env.KIMI_API_KEY
  assert.strictEqual(kimiVisionProvider.isConfigured(), false)
  restoreEnv()
})

test('A. isConfigured() is true when KIMI_API_KEY is set', () => {
  process.env.KIMI_API_KEY = 'test-key-value'
  assert.strictEqual(kimiVisionProvider.isConfigured(), true)
  restoreEnv()
})

test('A. analyzeFoodImage fails closed with VISION_PROVIDER_UNAVAILABLE when the key is missing, and never calls fetch', async () => {
  delete process.env.KIMI_API_KEY
  let fetchCalled = false
  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should never be called without an API key')
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(fetchCalled, false)
  assert.strictEqual(outcome.error?.code, 'VISION_PROVIDER_UNAVAILABLE')
  restoreEnv()
})

test('B. sends the correct model, image content block, and structured-output instruction, with no secret in the returned payload', async () => {
  process.env.KIMI_API_KEY = 'super-secret-test-key-12345'
  process.env.KIMI_VISION_MODEL = 'kimi-k2.6'
  let capturedInit: RequestInit | undefined
  let capturedUrl: string | undefined
  global.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url
    capturedInit = init
    return jsonResponse(chatCompletionBody(VALID_ANALYSIS))
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)

  assert.strictEqual(capturedUrl, 'https://api.moonshot.ai/v1/chat/completions')
  const body = JSON.parse(capturedInit!.body as string)
  assert.strictEqual(body.model, 'kimi-k2.6')
  assert.strictEqual(body.response_format?.type, 'json_object')
  const userMessage = body.messages.find((m: { role: string }) => m.role === 'user')
  const imageBlock = userMessage.content.find((c: { type: string }) => c.type === 'image_url')
  assert.ok(imageBlock.image_url.url.startsWith('data:image/jpeg;base64,'), 'image must be sent as a base64 data URI')

  const headers = capturedInit!.headers as Record<string, string>
  assert.strictEqual(headers.Authorization, 'Bearer super-secret-test-key-12345')

  // The secret must never appear anywhere in the returned outcome.
  const serializedOutcome = JSON.stringify(outcome)
  assert.ok(!serializedOutcome.includes('super-secret-test-key-12345'), 'API key must never appear in the returned payload')

  restoreEnv()
})

test('B. defaults to kimi-k2.6 when KIMI_VISION_MODEL is not set', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  delete process.env.KIMI_VISION_MODEL
  let capturedBody: string | undefined
  global.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = init?.body as string
    return jsonResponse(chatCompletionBody(VALID_ANALYSIS))
  }) as typeof fetch

  await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(JSON.parse(capturedBody!).model, 'kimi-k2.6')
  restoreEnv()
})

test('C/success: a valid response parses into the normalized result', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  global.fetch = (async () => jsonResponse(chatCompletionBody(VALID_ANALYSIS))) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error, null)
  assert.strictEqual(outcome.result?.items[0].name, 'Apple')
  assert.strictEqual(outcome.model, 'kimi-k2.6')
  assert.ok(outcome.latencyMs >= 0)
  restoreEnv()
})

test('D. maps 401 to VISION_AUTH_ERROR and does not retry', async () => {
  process.env.KIMI_API_KEY = 'bad-key'
  let callCount = 0
  global.fetch = (async () => {
    callCount++
    return jsonResponse({ error: { type: 'invalid_authentication_error', message: 'Invalid Authentication' } }, 401)
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_AUTH_ERROR')
  assert.strictEqual(callCount, 1, 'authentication errors must not be retried')
  restoreEnv()
})

test('D. maps 429 to VISION_RATE_LIMITED and does not retry', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  let callCount = 0
  global.fetch = (async () => {
    callCount++
    return jsonResponse({ error: { type: 'rate_limit_reached_error', message: 'RPM exceeded' } }, 429)
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_RATE_LIMITED')
  assert.strictEqual(callCount, 1, 'rate limit errors must not be retried (cost control)')
  restoreEnv()
})

test('D. maps a 5xx server error to VISION_PROVIDER_ERROR and retries at most once', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  let callCount = 0
  global.fetch = (async () => {
    callCount++
    return jsonResponse({ error: { type: 'server_error', message: 'Internal server error' } }, 500)
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_PROVIDER_ERROR')
  assert.strictEqual(callCount, 2, 'a persistent 5xx should be retried exactly once, then fail (very low retry budget)')
  restoreEnv()
})

test('D. a transient 5xx that succeeds on retry returns a successful result', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  let callCount = 0
  global.fetch = (async () => {
    callCount++
    if (callCount === 1) return jsonResponse({ error: { type: 'server_error', message: 'temporary' } }, 500)
    return jsonResponse(chatCompletionBody(VALID_ANALYSIS))
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error, null)
  assert.strictEqual(callCount, 2)
  restoreEnv()
})

test('D. a timeout maps to VISION_TIMEOUT and is NOT retried (a live smoke test showed a genuinely slow analysis times out again identically)', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  let callCount = 0
  global.fetch = (async () => {
    callCount++
    const err = new Error('The operation was aborted due to timeout')
    err.name = 'TimeoutError'
    throw err
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_TIMEOUT')
  assert.strictEqual(callCount, 1, 'a timeout must not be retried - it only doubles cost/wait for a request that is genuinely slow, not transient')
  restoreEnv()
})

test('D. a manually-aborted request (AbortError, not TimeoutError) is also classified as VISION_TIMEOUT', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  global.fetch = (async () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    throw err
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_TIMEOUT')
  restoreEnv()
})

test('D. a generic network failure maps to VISION_NETWORK_ERROR', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  global.fetch = (async () => {
    throw new Error('getaddrinfo ENOTFOUND api.moonshot.ai')
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_NETWORK_ERROR')
  restoreEnv()
})

test('D. a malformed (non-JSON) response body maps to VISION_INVALID_RESPONSE', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  global.fetch = (async () => new Response('not json at all', { status: 200 })) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_INVALID_RESPONSE')
  restoreEnv()
})

test('D. a response whose message.content is not valid JSON maps to VISION_INVALID_RESPONSE after one retry', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  let callCount = 0
  global.fetch = (async () => {
    callCount++
    return jsonResponse({ choices: [{ message: { content: 'I cannot help with that request.' } }] })
  }) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_INVALID_RESPONSE')
  assert.strictEqual(callCount, 2, 'malformed model output gets exactly one retry, never more')
  restoreEnv()
})

test('an empty AI result (is_food_photo=false) maps to VISION_NO_FOOD_DETECTED, not a hard failure', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  global.fetch = (async () =>
    jsonResponse(
      chatCompletionBody({
        is_food_photo: false,
        items: [],
        overall_confidence: 0.9,
        meal_description: null,
        warnings: ['This looks like a restaurant menu, not food']
      })
    )) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.strictEqual(outcome.error?.code, 'VISION_NO_FOOD_DETECTED')
  restoreEnv()
})

test('F. provider internals (raw error body) are not leaked into the returned error message', async () => {
  process.env.KIMI_API_KEY = 'test-key'
  global.fetch = (async () =>
    jsonResponse({ error: { type: 'invalid_authentication_error', message: 'super-internal-detail-should-not-leak-xyz123' } }, 401)) as typeof fetch

  const outcome = await kimiVisionProvider.analyzeFoodImage(testImage)
  assert.ok(!outcome.error?.message.includes('super-internal-detail-should-not-leak-xyz123'))
  restoreEnv()
})
