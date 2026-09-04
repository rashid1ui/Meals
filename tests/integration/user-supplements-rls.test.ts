// Integration test - hits the real Supabase project end to end, as actual
// authenticated users, exercising the same RLS policies production traffic
// goes through. Deliberately NOT part of `npm test` (requires live
// credentials and mutates real rows) - run manually with `npm run
// test:user-supplements` after populating .env.local. Mirrors
// tests/integration/supplement-db.test.ts's own pattern.
//
// Covers spec section 19's "Database/security" checklist for the Vitamins &
// Supplements tracker: a user can create/read/update/delete their OWN
// user_supplements rows, and can never read, update, or delete another
// user's row - enforced entirely by the "Users can manage own supplements"
// RLS policy (supabase/migrations/0027_user_supplements.sql), not by
// application code.
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:user-supplements).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createSignedInUser(): Promise<{ client: any; userId: string; cleanup: () => Promise<void> }> {
  const email = `user-supplements-rls-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const password = crypto.randomUUID()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  if (createError || !created.user) {
    throw new Error(`Failed to create test user: ${createError?.message}`)
  }

  const client = createClient(NEXT_PUBLIC_SUPABASE_URL!, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`Failed to sign in as test user: ${signInError.message}`)

  return {
    client,
    userId: created.user.id,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(created.user.id)
    }
  }
}

const SAMPLE_SUPPLEMENT = {
  name: 'RLS Test Vitamin D3',
  dose: 5000,
  dose_unit: 'IU',
  quantity: 1,
  quantity_unit: 'capsule',
  frequency: 'once_daily',
  times: ['08:00'],
  notification_enabled: true
}

test('a user can create, read, update, and delete their own supplement', async () => {
  const user = await createSignedInUser()
  try {
    const { data: inserted, error: insertError } = await user.client
      .from('user_supplements')
      .insert(SAMPLE_SUPPLEMENT)
      .select()
      .single()
    assert.strictEqual(insertError, null, `Insert must succeed: ${insertError?.message}`)
    assert.ok(inserted?.id)
    assert.strictEqual(inserted.user_id, user.userId, 'Inserted row must be owned by the inserting user')

    const { data: read, error: readError } = await user.client
      .from('user_supplements')
      .select('*')
      .eq('id', inserted.id)
      .single()
    assert.strictEqual(readError, null)
    assert.strictEqual(read?.name, SAMPLE_SUPPLEMENT.name)

    const { data: updated, error: updateError } = await user.client
      .from('user_supplements')
      .update({ notification_enabled: false })
      .eq('id', inserted.id)
      .select()
      .single()
    assert.strictEqual(updateError, null)
    assert.strictEqual(updated?.notification_enabled, false)

    const { error: deleteError } = await user.client.from('user_supplements').delete().eq('id', inserted.id)
    assert.strictEqual(deleteError, null)

    const { data: afterDelete } = await user.client.from('user_supplements').select('id').eq('id', inserted.id).maybeSingle()
    assert.strictEqual(afterDelete, null, 'Deleted row must no longer be visible')
  } finally {
    await user.cleanup()
  }
})

test('a user cannot read, update, or delete another user\'s supplement', async () => {
  const owner = await createSignedInUser()
  const intruder = await createSignedInUser()
  try {
    const { data: inserted, error: insertError } = await owner.client
      .from('user_supplements')
      .insert({ ...SAMPLE_SUPPLEMENT, name: 'RLS Isolation Target' })
      .select()
      .single()
    assert.strictEqual(insertError, null)
    assert.ok(inserted?.id)

    // SELECT: RLS makes the row simply invisible to another user - not an
    // error, zero rows.
    const { data: intruderRead, error: intruderReadError } = await intruder.client
      .from('user_supplements')
      .select('*')
      .eq('id', inserted.id)
      .maybeSingle()
    assert.strictEqual(intruderReadError, null)
    assert.strictEqual(intruderRead, null, 'Another user must not be able to read this row')

    // UPDATE: matches zero rows under the intruder's RLS scope, so the
    // owner's row is left completely untouched.
    const { data: intruderUpdate, error: intruderUpdateError } = await intruder.client
      .from('user_supplements')
      .update({ notification_enabled: false })
      .eq('id', inserted.id)
      .select()
    assert.strictEqual(intruderUpdateError, null)
    assert.strictEqual((intruderUpdate || []).length, 0, 'Update must affect zero rows for a non-owner')

    // DELETE: same - zero rows affected, row still exists for its owner.
    const { error: intruderDeleteError } = await intruder.client.from('user_supplements').delete().eq('id', inserted.id)
    assert.strictEqual(intruderDeleteError, null)

    const { data: stillThere, error: ownerReadError } = await owner.client
      .from('user_supplements')
      .select('id, notification_enabled')
      .eq('id', inserted.id)
      .single()
    assert.strictEqual(ownerReadError, null)
    assert.ok(stillThere, 'Owner must still see their own row after the intruder\'s no-op attempts')
    assert.strictEqual(stillThere.notification_enabled, true, 'Row must be unmodified by the intruder\'s update attempt')

    await owner.client.from('user_supplements').delete().eq('id', inserted.id)
  } finally {
    await owner.cleanup()
    await intruder.cleanup()
  }
})
