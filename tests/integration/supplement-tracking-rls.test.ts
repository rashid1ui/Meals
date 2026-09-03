// Integration test - hits the real Supabase project end to end, as actual
// authenticated users, exercising the same RLS policies production traffic
// goes through. Deliberately NOT part of `npm test` (requires live
// credentials and mutates real rows) - run manually with `npm run
// test:supplement-tracking` after populating .env.local. Mirrors
// tests/integration/user-supplements-rls.test.ts's own pattern, for the
// daily supplement dose tracking table (supabase/migrations/
// 0028_supplement_tracking.sql).
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:supplement-tracking).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createSignedInUser(): Promise<{ client: any; userId: string; cleanup: () => Promise<void> }> {
  const email = `supplement-tracking-rls-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createSupplement(client: any, overrides: Record<string, unknown> = {}) {
  const { data, error } = await client
    .from('user_supplements')
    .insert({
      name: 'RLS Tracking Test Vitamin D3',
      dose: 5000,
      dose_unit: 'IU',
      quantity: 1,
      quantity_unit: 'capsule',
      frequency: 'once_daily',
      times: ['08:00'],
      notification_enabled: true,
      ...overrides
    })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to create supplement fixture: ${error?.message}`)
  return data
}

test('a user can create, read, update, and delete their own supplement_tracking row', async () => {
  const user = await createSignedInUser()
  try {
    const supplement = await createSupplement(user.client)

    const { data: inserted, error: insertError } = await user.client
      .from('supplement_tracking')
      .insert({
        user_supplement_id: supplement.id,
        tracking_date: '2026-01-15',
        scheduled_time: '08:00',
        completed: true,
        completed_at: new Date().toISOString()
      })
      .select()
      .single()
    assert.strictEqual(insertError, null, `Insert must succeed: ${insertError?.message}`)
    assert.ok(inserted?.id)
    assert.strictEqual(inserted.user_id, user.userId, 'Inserted row must be owned by the inserting user')

    const { data: read, error: readError } = await user.client.from('supplement_tracking').select('*').eq('id', inserted.id).single()
    assert.strictEqual(readError, null)
    assert.strictEqual(read?.completed, true)

    const { data: updated, error: updateError } = await user.client
      .from('supplement_tracking')
      .update({ completed: false, completed_at: null })
      .eq('id', inserted.id)
      .select()
      .single()
    assert.strictEqual(updateError, null)
    assert.strictEqual(updated?.completed, false)

    const { error: deleteError } = await user.client.from('supplement_tracking').delete().eq('id', inserted.id)
    assert.strictEqual(deleteError, null)

    const { data: afterDelete } = await user.client.from('supplement_tracking').select('id').eq('id', inserted.id).maybeSingle()
    assert.strictEqual(afterDelete, null)
  } finally {
    await user.cleanup()
  }
})

test('the (user_id, user_supplement_id, tracking_date, scheduled_time) unique constraint rejects a duplicate dose row', async () => {
  const user = await createSignedInUser()
  try {
    const supplement = await createSupplement(user.client)

    const { error: firstError } = await user.client.from('supplement_tracking').insert({
      user_supplement_id: supplement.id,
      tracking_date: '2026-01-16',
      scheduled_time: '08:00',
      completed: false
    })
    assert.strictEqual(firstError, null)

    const { error: duplicateError } = await user.client.from('supplement_tracking').insert({
      user_supplement_id: supplement.id,
      tracking_date: '2026-01-16',
      scheduled_time: '08:00',
      completed: false
    })
    assert.ok(duplicateError, 'A second insert for the exact same dose must be rejected by the unique constraint')
    assert.strictEqual(duplicateError!.code, '23505')
  } finally {
    await user.cleanup()
  }
})

test('re-running the lazy dose initializer (ignoreDuplicates upsert) never resets an already-completed dose', async () => {
  // Exercises the exact upsert lib/supplements/trackingActions.ts's
  // ensureTodayDoseRows performs - a Dashboard refresh (or two concurrent
  // tabs) must never create a duplicate row or silently roll back a
  // completion that was already recorded.
  const user = await createSignedInUser()
  try {
    const supplement = await createSupplement(user.client)

    const { error: markTakenError } = await user.client.from('supplement_tracking').insert({
      user_supplement_id: supplement.id,
      tracking_date: '2026-01-18',
      scheduled_time: '08:00',
      completed: true,
      completed_at: new Date().toISOString()
    })
    assert.strictEqual(markTakenError, null)

    // The lazy initializer's exact shape: completed=false, onConflict
    // ignoreDuplicates - simulating a page refresh re-ensuring today's rows.
    const { error: reinitError } = await user.client.from('supplement_tracking').upsert(
      { user_id: user.userId, user_supplement_id: supplement.id, tracking_date: '2026-01-18', scheduled_time: '08:00', completed: false },
      { onConflict: 'user_id,user_supplement_id,tracking_date,scheduled_time', ignoreDuplicates: true }
    )
    assert.strictEqual(reinitError, null)

    const { data: row, error: readError } = await user.client
      .from('supplement_tracking')
      .select('completed')
      .eq('user_supplement_id', supplement.id)
      .eq('tracking_date', '2026-01-18')
      .eq('scheduled_time', '08:00')
      .single()
    assert.strictEqual(readError, null)
    assert.strictEqual(row?.completed, true, 're-initializing must never overwrite an already-recorded completion')
  } finally {
    await user.cleanup()
  }
})

test('completion is date-specific: marking a dose taken today does not affect the same supplement/time on a different day', async () => {
  const user = await createSignedInUser()
  try {
    const supplement = await createSupplement(user.client)

    await user.client.from('supplement_tracking').insert({
      user_supplement_id: supplement.id,
      tracking_date: '2026-01-19',
      scheduled_time: '08:00',
      completed: true,
      completed_at: new Date().toISOString()
    })
    await user.client.from('supplement_tracking').insert({
      user_supplement_id: supplement.id,
      tracking_date: '2026-01-20',
      scheduled_time: '08:00',
      completed: false
    })

    const { data: day1 } = await user.client
      .from('supplement_tracking')
      .select('completed')
      .eq('user_supplement_id', supplement.id)
      .eq('tracking_date', '2026-01-19')
      .single()
    const { data: day2 } = await user.client
      .from('supplement_tracking')
      .select('completed')
      .eq('user_supplement_id', supplement.id)
      .eq('tracking_date', '2026-01-20')
      .single()

    assert.strictEqual(day1?.completed, true)
    assert.strictEqual(day2?.completed, false, "yesterday's completion must not leak into a different day's row")
  } finally {
    await user.cleanup()
  }
})

test('a user cannot read, update, mark taken, or delete another user\'s supplement_tracking row', async () => {
  const owner = await createSignedInUser()
  const intruder = await createSignedInUser()
  try {
    const supplement = await createSupplement(owner.client, { name: 'RLS Tracking Isolation Target' })
    const { data: row, error: insertError } = await owner.client
      .from('supplement_tracking')
      .insert({ user_supplement_id: supplement.id, tracking_date: '2026-01-17', scheduled_time: '08:00', completed: false })
      .select()
      .single()
    assert.strictEqual(insertError, null)
    assert.ok(row?.id)

    // SELECT: invisible to another user - zero rows, not an error.
    const { data: intruderRead, error: intruderReadError } = await intruder.client
      .from('supplement_tracking')
      .select('*')
      .eq('id', row.id)
      .maybeSingle()
    assert.strictEqual(intruderReadError, null)
    assert.strictEqual(intruderRead, null, 'Another user must not be able to read this tracking row')

    // UPDATE (attempting to mark another user's dose taken): zero rows
    // affected, owner's row untouched.
    const { data: intruderUpdate, error: intruderUpdateError } = await intruder.client
      .from('supplement_tracking')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', row.id)
      .select()
    assert.strictEqual(intruderUpdateError, null)
    assert.strictEqual((intruderUpdate || []).length, 0, 'Update must affect zero rows for a non-owner')

    // DELETE: same - zero rows affected.
    const { error: intruderDeleteError } = await intruder.client.from('supplement_tracking').delete().eq('id', row.id)
    assert.strictEqual(intruderDeleteError, null)

    const { data: stillThere, error: ownerReadError } = await owner.client
      .from('supplement_tracking')
      .select('id, completed')
      .eq('id', row.id)
      .single()
    assert.strictEqual(ownerReadError, null)
    assert.ok(stillThere, "Owner must still see their own row after the intruder's no-op attempts")
    assert.strictEqual(stillThere.completed, false, "Row must be unmodified by the intruder's update attempt")

    await owner.client.from('supplement_tracking').delete().eq('id', row.id)
  } finally {
    await owner.cleanup()
    await intruder.cleanup()
  }
})
