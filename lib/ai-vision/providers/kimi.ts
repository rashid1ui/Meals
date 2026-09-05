// Kimi K2.6 (Moonshot AI) implementation of VisionProvider. This is the
// ONLY file in the app that knows Kimi's request/response shape, its
// endpoint, or reads KIMI_API_KEY - everything else depends only on
// lib/ai-vision/types.ts's provider-agnostic interface (approved design,
// Question 4: "Kimi must be hidden behind a VisionProvider interface").
//
// Follows this codebase's existing AI-integration convention exactly
// (lib/diet/generate-diet.ts): plain fetch, no SDK, KIMI_API_KEY read at
// call time (never at module load, so a missing key fails the specific
// request rather than crashing the module graph). Timeout uses
// AbortSignal.timeout() rather than generate-diet.ts's manual
// AbortController + setTimeout pattern - see REQUEST_TIMEOUT_MS's comment
// for why a live smoke test showed the manual pattern unreliable here.
//
// API surface verified against Moonshot's own current documentation
// (platform.kimi.ai/docs, September 2026 snapshot) before writing this:
//   - Endpoint: https://api.moonshot.ai/v1/chat/completions (OpenAI-
//     compatible Chat Completions).
//   - Vision input: a `content` array with an `image_url` block whose
//     `url` is a base64 data URI (`data:image/jpeg;base64,...`) - the
//     docs' own example uses exactly this shape, not a hosted URL.
//   - `kimi-k2.6` is confirmed as a currently-available, named model
//     (alongside a newer `kimi-k3` flagship not requested here).
//   - response_format: Moonshot's own docs state `kimi-k2.6` "occasionally
//     behaves unstably with complex schemas" under strict `json_schema`
//     mode - `json_object` mode (guarantee valid JSON, no field
//     constraints) is used instead, with the exact shape enforced by our
//     own schema.ts validator, exactly like the existing DeepSeek
//     integration already does for meal-plan generation.
//   - Error body shape: `{"error": {"type": "...", "message": "..."}}`,
//     with documented status codes 400/401/403/404/429/499/500/503/504.

import type { FoodAnalysisRequest, VisionAnalysisOutcome, VisionErrorCode, VisionProvider } from '../types'
import { parseFoodAnalysisResponse } from '../schema'

const KIMI_API_ENDPOINT = 'https://api.moonshot.ai/v1/chat/completions'
const DEFAULT_KIMI_MODEL = 'kimi-k2.6'

// A single food-photo analysis should feel fast; Kimi's own documented
// upstream ceiling is 900s (504 territory), but we never want a scan
// hanging anywhere near that - fail fast and let the caller offer manual
// entry instead (approved design, Question 10/14). Live smoke-test
// history: with kimi-k2.6's default "thinking" mode left ON, a single-item
// photo took ~28s and two different multi-item photos consistently
// exceeded even 60s (traced to extended reasoning, not a fluke or rate
// limiting - confirmed by retrying after a cool-down). Disabling thinking
// (see `thinking: {type:'disabled'}` below) brought real latency down to
// ~6-10s for both cases. 60s is kept as a generous safety margin for
// larger/unusual images or provider-side variance, not because typical
// latency is anywhere near it.
const REQUEST_TIMEOUT_MS = 60_000

// Deliberately very low (approved design, Question 10: "avoid aggressive
// retry loops that could multiply API costs"; Phase 3 instructions: "keep
// retry count very low"). One extra attempt covers a single transient
// blip or a single malformed-JSON response - never authentication or rate
// limit errors, which retrying cannot fix. Timeouts specifically are ALSO
// never retried (see below): the same smoke test showed a genuinely slow
// analysis times out again on retry, so retrying just doubles both cost
// and the user's wait for no benefit - only network/5xx failures (truly
// transient) get the extra attempt.
const MAX_ATTEMPTS = 2

const SYSTEM_PROMPT = `You are a careful, honest food-photo analyst for a nutrition tracking app. You will be shown one photo. Your ONLY job is to identify visible food and estimate portion size - you must NOT calculate or state calories, protein, carbohydrates, or fat; a separate system handles nutrition.

Follow these rules strictly:
1. First decide whether the photo actually shows food that is being eaten or about to be eaten. If it does not (for example: a menu, a receipt, a person, an empty table, packaging with no visible food, or anything unrelated), set "is_food_photo" to false, leave "items" empty, and explain why in "warnings".
2. If it is food, identify each visually distinct food item or component separately when you can tell them apart (e.g. "grilled chicken breast", "steamed rice", and "broccoli" as three items, not one vague "plate of food").
3. For each item, estimate a weight in grams ONLY if the photo gives a reasonable basis to do so (a visible plate/utensil for scale, a familiar portion shape, etc). If you cannot make a reasonable estimate, set estimated_weight_g to null - never guess a number just to fill the field.
4. You may give a short plain-words portion description (e.g. "about a fist-sized portion", "one regular-sized burger") even when the numeric weight is null.
5. Give a confidence score between 0 and 1 for each item, and one overall confidence for the whole analysis. Be honest - a blurry, dark, or partially-obscured photo should get a LOW confidence, not a falsely high one.
6. Prefer a generic description over guessing a specific restaurant or brand (e.g. "cheeseburger with fries" rather than inventing a specific chain name), unless packaging or branding is clearly and unambiguously visible.
7. Never assume an ingredient is present unless you can actually see it, or it is an unavoidable, standard part of a preparation you're confident about (e.g. bread in a sandwich). If sauces, oil, or dressing are likely but not clearly visible, mention this uncertainty in a warning instead of silently assuming an amount.
8. Mention the likely preparation method when it's visually obvious (grilled, fried, steamed, raw, baked) - never invent a preparation method you can't actually tell from the image.
9. If multiple foods are mixed together so they cannot be reliably told apart (a casserole, a stew, a smoothie), describe the dish as a single item and say so plainly in a warning rather than inventing a fake ingredient breakdown.
10. If you are unsure about anything, say so honestly in "warnings" or "notes" rather than presenting a guess as fact. Returning null or a lower confidence score is always better than fabricated precision.

Respond with ONLY a single valid JSON object matching exactly this shape - no markdown formatting, no commentary outside the JSON:
{
  "is_food_photo": boolean,
  "items": [
    {
      "name": string,
      "estimated_weight_g": number or null,
      "estimated_portion_description": string or null,
      "confidence": number between 0 and 1, or null,
      "notes": string or null
    }
  ],
  "overall_confidence": number between 0 and 1, or null,
  "meal_description": string or null,
  "warnings": array of short strings (can be empty)
}`

function resolveModel(): string {
  return process.env.KIMI_VISION_MODEL?.trim() || DEFAULT_KIMI_MODEL
}

function errorOutcome(model: string, latencyMs: number, code: VisionErrorCode, message: string): VisionAnalysisOutcome {
  return { model, latencyMs, result: null, error: { code, message } }
}

// Maps a non-2xx HTTP response to our normalized taxonomy. Only the status
// code and provider-documented `error.type` are used - the raw
// `error.message` is logged (truncated, never containing the API key,
// since Kimi never echoes request headers back) but not returned to the
// caller, keeping provider wording out of user-facing/UI-adjacent code.
function classifyHttpError(status: number): { code: VisionErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: 'VISION_AUTH_ERROR', retryable: false }
  if (status === 429) return { code: 'VISION_RATE_LIMITED', retryable: false }
  if (status >= 500) return { code: 'VISION_PROVIDER_ERROR', retryable: true }
  // 400 (bad request) / 404 (model not found) - Phase 2 already validated
  // the image before it reached us, so an unexpected 4xx here is treated
  // as a provider-side problem, not something to retry blindly.
  return { code: 'VISION_PROVIDER_ERROR', retryable: false }
}

export const kimiVisionProvider: VisionProvider = {
  name: 'kimi',

  isConfigured(): boolean {
    return Boolean(process.env.KIMI_API_KEY)
  },

  async analyzeFoodImage(request: FoodAnalysisRequest): Promise<VisionAnalysisOutcome> {
    const model = resolveModel()
    const startedAt = Date.now()
    const apiKey = process.env.KIMI_API_KEY

    if (!apiKey) {
      // Fails closed before any network call - never a network request is
      // attempted without a real key (Phase 3 instructions section 3).
      return errorOutcome(model, Date.now() - startedAt, 'VISION_PROVIDER_UNAVAILABLE', 'Vision provider is not configured (missing KIMI_API_KEY).')
    }

    const dataUri = `data:${request.mimeType};base64,${request.imageBuffer.toString('base64')}`
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUri } },
          { type: 'text', text: 'Analyze this photo and return only the JSON object described in the system instructions.' }
        ]
      }
    ]

    let attempt = 1
    let lastNetworkOrServerError: VisionAnalysisOutcome | null = null

    while (attempt <= MAX_ATTEMPTS) {
      // AbortSignal.timeout() (native, Node 17.3+) rather than a manual
      // AbortController + setTimeout(() => controller.abort(), ...) pair -
      // a live smoke test against a larger, more complex photo showed the
      // manual pattern did not reliably cut the request off anywhere near
      // REQUEST_TIMEOUT_MS in practice (observed ~198s per attempt instead
      // of ~30s). The native timeout signal is what Node schedules
      // internally rather than through a user-land timer callback.
      let response: Response
      try {
        response = await fetch(KIMI_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages,
            // No `temperature` override: a live smoke test against the real
            // API revealed kimi-k2.6 rejects any value other than its
            // default (1) with a 400 - "invalid temperature: only 1 is
            // allowed for this model". Omitting the field lets the model
            // use its own default rather than hardcoding 1 and risking the
            // same brittleness if that default ever changes.
            response_format: { type: 'json_object' },
            // kimi-k2.6 defaults to extended "thinking" mode (Moonshot's
            // own docs: {"type":"enabled"} by default). A live smoke test
            // traced the multi-item-photo timeouts above to exactly this -
            // single-item photos completed in ~28s, but two different
            // multi-item photos consistently exceeded even a 60s budget
            // with thinking left on. This is a straightforward structured
            // identification task, not open-ended reasoning, so thinking
            // is disabled for faster, more direct responses.
            thinking: { type: 'disabled' }
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
      } catch (fetchErr: unknown) {
        const latencyMs = Date.now() - startedAt
        // AbortSignal.timeout() rejects with a DOMException named
        // 'TimeoutError'; a manually-aborted signal would be 'AbortError' -
        // both are the same "took too long" condition for our purposes.
        if (fetchErr instanceof Error && (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError')) {
          console.error(`[ai-vision/kimi] timeout on attempt ${attempt} (${latencyMs}ms elapsed)`)
          // Not retried (see MAX_ATTEMPTS's comment): a live smoke test
          // showed a genuinely slow analysis times out again identically
          // on retry, so retrying only doubles cost/wait for no benefit.
          return errorOutcome(model, latencyMs, 'VISION_TIMEOUT', 'The vision provider took too long to respond.')
        } else {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          console.error(`[ai-vision/kimi] network error on attempt ${attempt}: ${msg}`)
          lastNetworkOrServerError = errorOutcome(model, latencyMs, 'VISION_NETWORK_ERROR', 'A network error occurred while reaching the vision provider.')
        }
        attempt++
        continue
      }

      if (!response.ok) {
        const latencyMs = Date.now() - startedAt
        const bodyText = await response.text().catch(() => '')
        // Never logs the Authorization header; bodyText is the provider's
        // own response, truncated, which cannot contain our API key.
        console.error(`[ai-vision/kimi] HTTP ${response.status} on attempt ${attempt}: ${bodyText.slice(0, 300)}`)
        const { code, retryable } = classifyHttpError(response.status)
        const outcome = errorOutcome(model, latencyMs, code, describeHttpError(code))
        if (!retryable) return outcome
        lastNetworkOrServerError = outcome
        attempt++
        continue
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        const latencyMs = Date.now() - startedAt
        console.error(`[ai-vision/kimi] response body was not valid JSON on attempt ${attempt}`)
        return errorOutcome(model, latencyMs, 'VISION_INVALID_RESPONSE', 'The vision provider returned an unreadable response.')
      }

      const content = extractMessageContent(payload)
      if (!content) {
        const latencyMs = Date.now() - startedAt
        console.error(`[ai-vision/kimi] no message content in response on attempt ${attempt}`)
        if (attempt < MAX_ATTEMPTS) {
          attempt++
          continue
        }
        return errorOutcome(model, latencyMs, 'VISION_INVALID_RESPONSE', 'The vision provider returned an empty response.')
      }

      const parsed = parseFoodAnalysisResponse(content)
      const latencyMs = Date.now() - startedAt

      if (!parsed.ok) {
        console.error(`[ai-vision/kimi] ${parsed.reason} on attempt ${attempt}: ${parsed.detail.slice(0, 300)}`)
        if (attempt < MAX_ATTEMPTS) {
          attempt++
          continue
        }
        return errorOutcome(model, latencyMs, 'VISION_INVALID_RESPONSE', 'The vision provider returned a response that did not match the required format.')
      }

      if (!parsed.result.isFoodPhoto || parsed.result.items.length === 0) {
        return errorOutcome(model, latencyMs, 'VISION_NO_FOOD_DETECTED', 'No food could be identified in this photo.')
      }

      return { model, latencyMs, result: parsed.result, error: null }
    }

    // Exhausted MAX_ATTEMPTS on transient (network/timeout/5xx) failures.
    return lastNetworkOrServerError ?? errorOutcome(model, Date.now() - startedAt, 'VISION_PROVIDER_ERROR', 'The vision provider is currently unavailable.')
  }
}

function describeHttpError(code: VisionErrorCode): string {
  switch (code) {
    case 'VISION_AUTH_ERROR':
      return 'The vision provider rejected the request credentials.'
    case 'VISION_RATE_LIMITED':
      return 'The vision provider is temporarily rate-limiting requests.'
    default:
      return 'The vision provider returned an error.'
  }
}

// Kimi's Chat Completions response shape mirrors OpenAI's:
// { choices: [{ message: { content: string } }] }. Narrowed defensively
// since this is untrusted network input, not assumed to match.
function extractMessageContent(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as { message?: unknown } | undefined)?.message
  if (typeof message !== 'object' || message === null) return null
  const content = (message as { content?: unknown }).content
  return typeof content === 'string' && content.trim().length > 0 ? content : null
}
