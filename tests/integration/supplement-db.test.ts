// Integration test - hits the real Supabase project end to end, as an
// actual authenticated user, exercising the same RLS policies production
// traffic goes through. Deliberately NOT part of `npm test` (requires live
// credentials and mutates real rows) - run manually with `npm run
// test:supplement-db` after populating .env.local.
//
// Regression coverage for the production bug fixed by migration
// 0014_food_database_supplement_select_rls.sql: onboarding with Creatine (or
// any brand-new supplement config) failed with "Failed to save your
// creatine supplement" because the food_database SELECT RLS policy
// (`is_active = true`) also gates what `INSERT ... RETURNING` is allowed to
// return, and supplement rows are always inserted with is_active = false.
// A pure unit test of lib/diet/supplements.ts cannot catch this class of bug
// since it never touches the database - only a real insert against the live
// RLS policies can.
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:supplement-db).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withAuthenticatedUser<T>(fn: (userClient: any) => Promise<T>): Promise<T> {
  const email = `supplement-rls-test-${Date.now()}@example.com`
  const password = crypto.randomUUID()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  if (createError || !created.user) {
    throw new Error(`Failed to create test user: ${createError?.message}`)
  }

  try {
    const userClient = createClient(NEXT_PUBLIC_SUPABASE_URL!, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password })
    if (signInError) {
      throw new Error(`Failed to sign in as test user: ${signInError.message}`)
    }
    return await fn(userClient)
  } finally {
    await admin.auth.admin.deleteUser(created.user.id)
  }
}

test('Creatine only: inserting a new supplement row as an authenticated user succeeds and returns its id', async () => {
  const name = `RLS Regression Creatine ${Date.now()}`
  let insertedId: string | null = null

  try {
    await withAuthenticatedUser(async userClient => {
      // Exactly the shape app/onboarding/actions.ts inserts for a creatine
      // supplement: category='supplement', is_active=false, zero macros.
      const { data, error } = await userClient
        .from('food_database')
        .insert({
          name,
          category: 'supplement',
          protein_type: 'supplement',
          serving_size: 100,
          serving_unit: 'grams',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          display_unit: 'serving',
          grams_per_display_unit: 5,
          is_active: false
        })
        .select('id')
        .single()

      assert.strictEqual(error, null, `Insert must not be rejected by RLS: ${error?.message}`)
      assert.ok(data?.id, 'Insert must return the new row id')
      insertedId = data!.id as string

      // The pre-insert "does this already exist" / post-conflict "who won
      // the race" lookups both rely on being able to see is_active=false
      // supplement rows by name.
      const { data: found, error: findError } = await userClient
        .from('food_database')
        .select('id')
        .ilike('name', name)
        .maybeSingle()

      assert.strictEqual(findError, null)
      assert.strictEqual(found?.id, insertedId, 'Newly inserted supplement row must be visible to its own creator')
    })
  } finally {
    if (insertedId) await admin.from('food_database').delete().eq('id', insertedId)
  }
})

test('Whey + Creatine: both supplement rows can be created back to back by the same user', async () => {
  const wheyName = `RLS Regression Whey ${Date.now()}`
  const creatineName = `RLS Regression Creatine Combo ${Date.now()}`
  const insertedIds: string[] = []

  try {
    await withAuthenticatedUser(async userClient => {
      for (const [name, macros] of [
        [wheyName, { calories: 96, protein: 24, carbs: 0, fat: 0 }],
        [creatineName, { calories: 0, protein: 0, carbs: 0, fat: 0 }]
      ] as const) {
        const { data, error } = await userClient
          .from('food_database')
          .insert({
            name,
            category: 'supplement',
            protein_type: 'supplement',
            serving_size: 100,
            serving_unit: 'grams',
            ...macros,
            display_unit: 'serving',
            grams_per_display_unit: 30,
            is_active: false
          })
          .select('id')
          .single()

        assert.strictEqual(error, null, `Insert for "${name}" must not be rejected by RLS: ${error?.message}`)
        assert.ok(data?.id)
        insertedIds.push(data!.id as string)
      }
    })

    assert.strictEqual(insertedIds.length, 2, 'both supplements must have been created')
  } finally {
    for (const id of insertedIds) await admin.from('food_database').delete().eq('id', id)
  }
})
