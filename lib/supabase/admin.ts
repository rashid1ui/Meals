import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client: bypasses Row Level Security entirely. This is the
// correct, necessary exception to this project's usual rule (every other
// Supabase client - lib/supabase/server.ts/client.ts - is scoped to
// auth.uid() via the logged-in user's session cookie). The cron dispatcher
// has no logged-in user - it evaluates reminders for every user with
// notifications enabled - so it structurally cannot use the per-request
// client. `import 'server-only'` makes any accidental import from a 'use
// client' component a build error instead of silently bundling this key.
//
// Every caller MUST filter by an explicit user_id/id itself (see
// lib/notifications/admin.ts) - there is no RLS left to do it for you.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Configuration Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in the environment.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}
