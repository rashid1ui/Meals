// Integration test - hits the real Supabase project end to end, as actual
// authenticated users, exercising the same RLS policies production traffic
// goes through. Deliberately NOT part of `npm test` (requires live
// credentials and mutates real rows) - run manually with `npm run
// test:outside-plan-food-rls` after populating .env.local. Mirrors
// tests/integration/supplement-tracking-rls.test.ts's own pattern, for the
// AI Outside-Plan Food Scanner tables (supabase/migrations/
// 0031_outside_plan_food.sql).
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:outside-plan-food-rls).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createSignedInUser(): Promise<{ client: any; userId: string; cleanup: () => Promise<void> }> {
  const email = `outside-plan-food-rls-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
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
async function createEntry(client: any, overrides: Record<string, unknown> = {}) {
  const { data, error } = await client
    .from('outside_plan_food_entries')
    .insert({
      tracking_date: '2026-01-15',
      source: 'ai_scan',
      item_name: 'RLS Test Burger',
      calories: 720,
      protein: 35,
      carbs: 50,
      fat: 40,
      ...overrides
    })
    .select()
    .single()
  if (error || !data) throw new Error(`Failed to create outside_plan_food_entries fixture: ${error?.message}`)
  return data
}

test('a user can create, read, update, and delete their own outside_plan_food_entries row', async () => {
  const user = await createSignedInUser()
  try {
    const { data: inserted, error: insertError } = await user.client
      .from('outside_plan_food_entries')
      .insert({
        tracking_date: '2026-01-15',
        source: 'ai_scan',
        item_name: 'Cheeseburger with fries',
        quantity_description: '1 regular burger, medium fries',
        components: [{ name: 'burger', estimated_grams: 220, calories: 550, protein: 28, carbs: 35, fat: 30, confidence: 'medium' }],
        quantity_value: 350,
        quantity_unit: 'g',
        calories: 850,
        protein: 35,
        carbs: 70,
        fat: 45,
        ai_model: 'kimi-k2.6',
        ai_confidence: 'medium',
        ai_raw_response: { raw: true }
      })
      .select()
      .single()
    assert.strictEqual(insertError, null, `Insert must succeed: ${insertError?.message}`)
    assert.ok(inserted?.id)
    assert.strictEqual(inserted.user_id, user.userId, 'Inserted row must be owned by the inserting user')
    assert.strictEqual(inserted.was_edited, false, 'was_edited must default to false')

    const { data: read, error: readError } = await user.client
      .from('outside_plan_food_entries')
      .select('*')
      .eq('id', inserted.id)
      .single()
    assert.strictEqual(readError, null)
    assert.strictEqual(read?.item_name, 'Cheeseburger with fries')

    const { data: updated, error: updateError } = await user.client
      .from('outside_plan_food_entries')
      .update({ calories: 900, was_edited: true })
      .eq('id', inserted.id)
      .select()
      .single()
    assert.strictEqual(updateError, null)
    assert.strictEqual(updated?.calories, 900)
    assert.strictEqual(updated?.was_edited, true)

    const { error: deleteError } = await user.client.from('outside_plan_food_entries').delete().eq('id', inserted.id)
    assert.strictEqual(deleteError, null)

    const { data: afterDelete } = await user.client
      .from('outside_plan_food_entries')
      .select('id')
      .eq('id', inserted.id)
      .maybeSingle()
    assert.strictEqual(afterDelete, null)
  } finally {
    await user.cleanup()
  }
})

test('a manual-source entry (no photo) can be created with source=manual and no AI fields', async () => {
  const user = await createSignedInUser()
  try {
    const entry = await createEntry(user.client, {
      source: 'manual',
      item_name: 'Homemade lentil soup',
      calories: 300,
      protein: 15,
      carbs: 40,
      fat: 6
    })
    assert.strictEqual(entry.source, 'manual')
    assert.strictEqual(entry.ai_model, null)
    assert.strictEqual(entry.image_storage_path, null)
  } finally {
    await user.cleanup()
  }
})

test('check constraints reject invalid source, blank item_name, and out-of-range macros', async () => {
  const user = await createSignedInUser()
  try {
    const { error: badSource } = await user.client
      .from('outside_plan_food_entries')
      .insert({ tracking_date: '2026-01-15', source: 'not_a_real_source', item_name: 'X', calories: 1, protein: 1, carbs: 1, fat: 1 })
    assert.ok(badSource, 'An invalid source value must be rejected')

    const { error: blankName } = await user.client
      .from('outside_plan_food_entries')
      .insert({ tracking_date: '2026-01-15', source: 'manual', item_name: '   ', calories: 1, protein: 1, carbs: 1, fat: 1 })
    assert.ok(blankName, 'A blank/whitespace-only item_name must be rejected')

    const { error: tooManyCalories } = await user.client
      .from('outside_plan_food_entries')
      .insert({ tracking_date: '2026-01-15', source: 'manual', item_name: 'Implausible meal', calories: 50000, protein: 1, carbs: 1, fat: 1 })
    assert.ok(tooManyCalories, 'Calories above the 5000 ceiling must be rejected')

    const { error: negativeProtein } = await user.client
      .from('outside_plan_food_entries')
      .insert({ tracking_date: '2026-01-15', source: 'manual', item_name: 'Negative protein', calories: 100, protein: -5, carbs: 1, fat: 1 })
    assert.ok(negativeProtein, 'Negative protein must be rejected')

    const { error: badComponents } = await user.client
      .from('outside_plan_food_entries')
      .insert({
        tracking_date: '2026-01-15',
        source: 'manual',
        item_name: 'Bad components shape',
        calories: 100,
        protein: 1,
        carbs: 1,
        fat: 1,
        components: { not: 'an array' }
      })
    assert.ok(badComponents, 'components must be a JSON array, not an object')
  } finally {
    await user.cleanup()
  }
})

test('a user cannot read, update, or delete another user\'s outside_plan_food_entries row', async () => {
  const owner = await createSignedInUser()
  const intruder = await createSignedInUser()
  try {
    const entry = await createEntry(owner.client, { item_name: 'RLS Isolation Target Burger' })

    const { data: intruderRead, error: intruderReadError } = await intruder.client
      .from('outside_plan_food_entries')
      .select('*')
      .eq('id', entry.id)
      .maybeSingle()
    assert.strictEqual(intruderReadError, null)
    assert.strictEqual(intruderRead, null, 'Another user must not be able to read this entry')

    const { data: intruderUpdate, error: intruderUpdateError } = await intruder.client
      .from('outside_plan_food_entries')
      .update({ calories: 1 })
      .eq('id', entry.id)
      .select()
    assert.strictEqual(intruderUpdateError, null)
    assert.strictEqual((intruderUpdate || []).length, 0, 'Update must affect zero rows for a non-owner')

    const { error: intruderDeleteError } = await intruder.client.from('outside_plan_food_entries').delete().eq('id', entry.id)
    assert.strictEqual(intruderDeleteError, null)

    const { data: stillThere, error: ownerReadError } = await owner.client
      .from('outside_plan_food_entries')
      .select('id, calories')
      .eq('id', entry.id)
      .single()
    assert.strictEqual(ownerReadError, null)
    assert.ok(stillThere, "Owner must still see their own row after the intruder's no-op attempts")
    assert.strictEqual(stillThere.calories, 720, "Row must be unmodified by the intruder's update attempt")

    await owner.client.from('outside_plan_food_entries').delete().eq('id', entry.id)
  } finally {
    await owner.cleanup()
    await intruder.cleanup()
  }
})

test('a user can create and read their own food_scan_events row, including a cached ai_response', async () => {
  const user = await createSignedInUser()
  try {
    const { data: inserted, error: insertError } = await user.client
      .from('food_scan_events')
      .insert({
        status: 'succeeded',
        image_hash: 'abc123deadbeef',
        ai_model: 'kimi-k2.6',
        ai_response: { item_name: 'Cheeseburger', calories: 850 },
        latency_ms: 1200
      })
      .select()
      .single()
    assert.strictEqual(insertError, null, `Insert must succeed: ${insertError?.message}`)
    assert.strictEqual(inserted.user_id, user.userId)
    assert.deepStrictEqual(inserted.ai_response, { item_name: 'Cheeseburger', calories: 850 })

    // The cache-lookup query shape: latest succeeded event for this user+hash.
    const { data: cached, error: cacheError } = await user.client
      .from('food_scan_events')
      .select('ai_response, ai_model')
      .eq('image_hash', 'abc123deadbeef')
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    assert.strictEqual(cacheError, null)
    assert.deepStrictEqual(cached?.ai_response, { item_name: 'Cheeseburger', calories: 850 })
  } finally {
    await user.cleanup()
  }
})

test('an invalid food_scan_events status is rejected by the check constraint', async () => {
  const user = await createSignedInUser()
  try {
    const { error } = await user.client.from('food_scan_events').insert({ status: 'not_a_real_status' })
    assert.ok(error, 'An invalid status value must be rejected')
  } finally {
    await user.cleanup()
  }
})

test('a user cannot read another user\'s food_scan_events row', async () => {
  const owner = await createSignedInUser()
  const intruder = await createSignedInUser()
  try {
    const { data: row, error: insertError } = await owner.client
      .from('food_scan_events')
      .insert({ status: 'succeeded', image_hash: 'isolation-hash', ai_response: { secret: true } })
      .select()
      .single()
    assert.strictEqual(insertError, null)

    const { data: intruderRead, error: intruderReadError } = await intruder.client
      .from('food_scan_events')
      .select('*')
      .eq('id', row.id)
      .maybeSingle()
    assert.strictEqual(intruderReadError, null)
    assert.strictEqual(intruderRead, null, 'Another user must not be able to read this scan event')
  } finally {
    await owner.cleanup()
    await intruder.cleanup()
  }
})

test('food_scan_events.resulting_entry_id links to a confirmed outside_plan_food_entries row and survives its deletion', async () => {
  const user = await createSignedInUser()
  try {
    const entry = await createEntry(user.client, { item_name: 'Linked entry' })
    const { data: event, error: eventError } = await user.client
      .from('food_scan_events')
      .insert({ status: 'succeeded', image_hash: 'link-hash', ai_response: { ok: true }, resulting_entry_id: entry.id })
      .select()
      .single()
    assert.strictEqual(eventError, null)
    assert.strictEqual(event.resulting_entry_id, entry.id)

    await user.client.from('outside_plan_food_entries').delete().eq('id', entry.id)

    const { data: afterDelete, error: readError } = await user.client
      .from('food_scan_events')
      .select('resulting_entry_id')
      .eq('id', event.id)
      .single()
    assert.strictEqual(readError, null)
    assert.strictEqual(afterDelete?.resulting_entry_id, null, 'ON DELETE SET NULL must preserve the scan event row itself')
  } finally {
    await user.cleanup()
  }
})

test('daily_tracking exposes the new outside_plan_* columns, defaulting to 0', async () => {
  const user = await createSignedInUser()
  try {
    const { data: inserted, error: insertError } = await user.client
      .from('daily_tracking')
      .insert({
        tracking_date: '2026-01-15',
        calories_target: 2000,
        protein_target: 150,
        carbs_target: 200,
        fat_target: 70
      })
      .select()
      .single()
    assert.strictEqual(insertError, null, `Insert must succeed: ${insertError?.message}`)
    assert.strictEqual(Number(inserted.outside_plan_calories), 0)
    assert.strictEqual(Number(inserted.outside_plan_protein), 0)
    assert.strictEqual(Number(inserted.outside_plan_carbs), 0)
    assert.strictEqual(Number(inserted.outside_plan_fat), 0)

    const { data: updated, error: updateError } = await user.client
      .from('daily_tracking')
      .update({ outside_plan_calories: 720, outside_plan_protein: 35, outside_plan_carbs: 50, outside_plan_fat: 40 })
      .eq('id', inserted.id)
      .select()
      .single()
    assert.strictEqual(updateError, null)
    assert.strictEqual(Number(updated.outside_plan_calories), 720)
  } finally {
    await user.cleanup()
  }
})
