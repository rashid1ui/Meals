/**
 * QA account reset - wipes ONLY the dedicated QA/E2E test account's own app
 * data (diet plans, meals, foods, tracking, supplements, notifications...)
 * so it can be re-onboarded and re-tested from a clean slate, repeatedly.
 *
 * Safety model (see lib/qa/identity.ts for the identity half of this):
 *   - No CLI argument ever selects the target - only the fixed
 *     QA_ACCOUNT_EMAIL / QA_ACCOUNT_USER_ID env vars do, and this script
 *     re-verifies the live profiles row against both before doing anything.
 *   - Only touches tables with a `user_id` column scoping them to one
 *     account (USER_SCOPED_TABLES below). NEVER touches food_database (a
 *     shared, unscoped catalog with no user column to safely filter by -
 *     any custom food the QA account added is indistinguishable from a real
 *     user's and must be reviewed/removed by hand if ever needed) and NEVER
 *     touches any auth.* table - the account's login/id/email are untouched,
 *     only its app data resets.
 *   - `profiles` is UPDATEd (biometric/onboarding fields cleared), never
 *     DELETEd - it's an FK target and the account must stay usable.
 *   - Dry-run by default; nothing is deleted/changed without --confirm.
 *   - This is a LOCAL SCRIPT ONLY, never an HTTP route - there is no
 *     network-reachable "reset" endpoint anywhere in this app.
 *
 * Usage (requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * QA_ACCOUNT_EMAIL, QA_ACCOUNT_USER_ID in .env.local - see .env.example):
 *   npm run qa:reset              # dry run: prints row counts, changes nothing
 *   npm run qa:reset -- --confirm # deletes/resets, logs exactly what happened
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { requireQaIdentity, assertIsQaIdentity } from '../lib/qa/identity'

async function loadDotEnvLocal(): Promise<void> {
  config({ path: '.env.local' })
  config({ path: '.env' })
}

// Every table scoped by a `user_id` column - see the migration files for
// each. Deliberately NOT a wildcard/introspected list: an explicit,
// reviewed list is the point (a future new table needs a deliberate,
// reviewed addition here, not automatic inclusion).
const USER_SCOPED_TABLES = [
  'supplement_tracking',
  'user_supplements',
  'notification_events',
  'notification_preferences',
  'push_subscriptions',
  'onboarding_drafts',
  'daily_tracking',
  'food_tracking',
  'foods',
  'meals',
  'diet_plans'
] as const

// Everything onboarding/biometric-derived on profiles - cleared so the
// account looks freshly-signed-up. id/email/full_name/avatar_url/timestamps
// are deliberately NOT included here - identity fields are never touched.
const PROFILE_RESET_FIELDS = {
  sex: null,
  age: null,
  height_cm: null,
  weight_kg: null,
  activity_level: null,
  training_days_per_week: null,
  body_fat_percent: null,
  average_daily_steps: null,
  current_calorie_intake: null,
  training_time: null,
  training_time_custom: null,
  uses_supplements: false,
  supplement_type: null,
  protein_brand: null,
  protein_serving_label: null,
  protein_per_serving_g: null,
  supplements: null,
  generation_lock_at: null,
  manual_plan_lock_at: null
}

async function main() {
  await loadDotEnvLocal()
  const confirm = process.argv.includes('--confirm')

  // Throws with a clear message if either env var is unset - fails closed.
  const identity = requireQaIdentity()

  const { SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL } = process.env
  if (!SUPABASE_SERVICE_ROLE_KEY || !NEXT_PUBLIC_SUPABASE_URL) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.')
    process.exit(1)
  }

  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Re-verify against the LIVE row - never trust the env var alone.
  const { data: profile, error: profileLookupError } = await admin
    .from('profiles')
    .select('id, email')
    .eq('id', identity.userId)
    .maybeSingle()

  if (profileLookupError || !profile) {
    console.error('ERROR: could not load the configured QA profile:', profileLookupError?.message ?? 'not found')
    process.exit(1)
  }
  assertIsQaIdentity(identity, profile) // throws + aborts on any mismatch

  console.log(`${confirm ? '[CONFIRMED - APPLYING CHANGES]' : '[DRY RUN - NOTHING WILL CHANGE]'} QA reset for ${identity.email} (${identity.userId})\n`)

  for (const table of USER_SCOPED_TABLES) {
    const { count, error: countError } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', identity.userId)

    if (countError) {
      console.error(`  ! ${table}: failed to count (${countError.message})`)
      continue
    }

    if (!confirm) {
      console.log(`  ${table}: ${count ?? 0} row(s) would be deleted`)
      continue
    }

    const { error: deleteError } = await admin.from(table).delete().eq('user_id', identity.userId)
    console.log(
      deleteError ? `  ! ${table}: delete failed (${deleteError.message})` : `  ${table}: deleted ${count ?? 0} row(s)`
    )
  }

  if (!confirm) {
    console.log(
      '\n  profiles: biometric/onboarding fields would be reset to NULL/default (id/email/full_name/avatar_url/timestamps kept)'
    )
    console.log('\nDry run only - nothing was changed. Re-run with --confirm to apply.')
    return
  }

  const { error: profileResetError } = await admin.from('profiles').update(PROFILE_RESET_FIELDS).eq('id', identity.userId)
  console.log(
    profileResetError ? `  ! profiles: reset failed (${profileResetError.message})` : '  profiles: biometric/onboarding fields reset'
  )

  console.log('\nDone. food_database was not touched. The QA account itself (auth login, id, email) was never touched.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
