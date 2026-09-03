// Pure - no React, no Supabase, no 'server-only'/'use client'. Unit-testable
// in a plain `node --test` run.
//
// Detects the one specific failure Next.js raises when a browser POSTs a
// Server Action reference id that the currently-running deployment no longer
// has in its action manifest - i.e. the client bundle and the server come
// from different deployments (deployment skew, e.g. the tab was opened
// before a redeploy). In Next 16.3 this surfaces as:
//
//   - client dispatcher: an `UnrecognizedActionError` whose message is
//     `Server Action "<id>" was not found on the server.`
//     (next/dist/client/components/router-reducer/reducers/server-action-reducer.js)
//   - server action handler: `Failed to find Server Action "<id>". This
//     request might be from an older or newer deployment.`
//     (next/dist/server/app-render/action-handler.js and manifests-singleton.js)
//
// This is NOT a generic "the request failed" signal and it is NOT specific
// to any one action - it means "reload to pick up the new build". Every
// other error (network failure, validation error, a thrown application
// error, a normal `{ error }` result) must NOT match, so the check stays
// deliberately narrow: the message has to name a Server Action AND carry one
// of the two known "not found" phrasings.
export function isStaleServerActionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  // Next's client dispatcher tags this exact failure with this class name.
  if (error.name === 'UnrecognizedActionError') return true

  const message = error.message
  if (!message.includes('Server Action')) return false
  return (
    message.includes('was not found on the server') ||
    message.includes('Failed to find Server Action')
  )
}
