// Pure - no Supabase, no 'server-only', no 'use client'/'use server'.
// Split out of push.ts (which does carry 'server-only', since it also
// imports the web-push package) purely so this one decision is
// unit-testable: 'server-only' unconditionally throws outside of Next's own
// bundler (it relies on webpack/turbopack aliasing it away for server
// compilations), so a plain `node --test` run of anything that imports it -
// including push.ts itself - fails immediately. This function needs none of
// that, so it lives where a test can import it directly.

// A 410 Gone or 404 Not Found means the push service itself says this
// endpoint can never succeed again (the browser/OS uninstalled or expired
// it) - remove it. Anything else (network blip, 5xx, malformed payload,
// etc.) is left in place for the next scheduled run to retry naturally.
export function classifyPushError(err: unknown): 'remove' | 'retry' {
  const statusCode = (err as { statusCode?: number } | null | undefined)?.statusCode
  return statusCode === 404 || statusCode === 410 ? 'remove' : 'retry'
}
