// Integration test - hits the real Supabase project end to end, as an
// actual authenticated user, exercising the same RLS policies
// app/onboarding/manual-actions.ts's createManualDietPlan/saveMealReminders
// go through in production. Deliberately NOT part of `npm test` (requires
// live credentials and mutates real rows) - run manually with `npm run
// test:manual-plan` after populating .env.local.
//
// createManualDietPlan/saveMealReminders are 'use server' actions that call
// next/headers' cookies() (via lib/supabase/server.ts's createClient) -
// that only works inside a real Next.js request's AsyncLocalStorage scope,
// not a plain `tsx --test` script (see tests/integration/supplement-db.test.ts,
// which follows the same constraint). This test instead exercises the exact
// same insert/update shapes those actions perform, directly against the
// live RLS policies, as a real signed-in user - the same "does this actually
// work against the database" guarantee, without needing a Next.js server.
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:manual-plan).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withAuthenticatedUser<T>(fn: (userClient: any, userId: string) => Promise<T>): Promise<T> {
  const email = `manual-plan-test-${Date.now()}@example.com`
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
    return await fn(userClient, created.user.id)
  } finally {
    await admin.auth.admin.deleteUser(created.user.id)
  }
}

test('createManualDietPlan shape: a user can create an active plan_source=user_created plan with real meals/foods', async () => {
  let planId: string | null = null
  const mealIds: string[] = []

  try {
    await withAuthenticatedUser(async (userClient, userId) => {
      // A real, active food_database row - same lookup createManualDietPlan
      // performs server-side before ever trusting a client-sent food.
      const { data: chicken, error: chickenError } = await userClient
        .from('food_database')
        .select('*')
        .eq('name', 'Chicken Breast, Raw')
        .eq('is_active', true)
        .single()
      assert.strictEqual(chickenError, null, `Fixture food lookup must succeed: ${chickenError?.message}`)
      assert.ok(chicken)

      // 1. Insert the diet plan - exactly the shape createManualDietPlan inserts.
      const { data: plan, error: planError } = await userClient
        .from('diet_plans')
        .insert({
          user_id: userId,
          name: 'My Meal Plan',
          calories_target: 2200,
          protein_target: 160,
          carbs_target: 220,
          fat_target: 70,
          is_active: true,
          plan_source: 'user_created'
        })
        .select()
        .single()
      assert.strictEqual(planError, null, `Diet plan insert must not be rejected by RLS: ${planError?.message}`)
      assert.ok(plan?.id)
      planId = plan!.id as string
      assert.strictEqual(plan!.plan_source, 'user_created')

      // 2. Insert a meal with insert-time reminder defaults (null/true),
      // exactly like createManualDietPlan.
      const { data: meal, error: mealError } = await userClient
        .from('meals')
        .insert({
          user_id: userId,
          diet_plan_id: planId,
          name: 'Lunch',
          sort_order: 0,
          reminder_time: null,
          reminder_enabled: true
        })
        .select()
        .single()
      assert.strictEqual(mealError, null, `Meal insert must not be rejected by RLS: ${mealError?.message}`)
      assert.ok(meal?.id)
      mealIds.push(meal!.id as string)

      // 3. Insert a food, with macros recomputed server-side (never trusting
      // client-sent numbers) via the same quantity-scaling calculation
      // calculateFoodMacros performs.
      const quantity = 150
      const multiplier = quantity / chicken.serving_size
      const { error: foodError } = await userClient.from('foods').insert({
        user_id: userId,
        meal_id: meal!.id,
        name: chicken.name,
        quantity,
        unit: chicken.serving_unit,
        calories: chicken.calories * multiplier,
        protein: chicken.protein * multiplier,
        carbs: chicken.carbs * multiplier,
        fat: chicken.fat * multiplier,
        sort_order: 0
      })
      assert.strictEqual(foodError, null, `Food insert must not be rejected by RLS: ${foodError?.message}`)

      // 4. Read the plan back and confirm plan_source persisted correctly.
      const { data: readBack, error: readError } = await userClient
        .from('diet_plans')
        .select('plan_source, is_active')
        .eq('id', planId)
        .single()
      assert.strictEqual(readError, null)
      assert.strictEqual(readBack?.plan_source, 'user_created')
      assert.strictEqual(readBack?.is_active, true)

      // 5. saveMealReminders shape: update the real meal's reminder fields
      // directly by id, ownership-scoped by user_id - no name/position
      // matching needed since the meal already has a real id.
      const { error: reminderError } = await userClient
        .from('meals')
        .update({ reminder_time: '08:30', reminder_enabled: true })
        .eq('id', meal!.id)
        .eq('user_id', userId)
      assert.strictEqual(reminderError, null, `Reminder update must not be rejected by RLS: ${reminderError?.message}`)

      const { data: mealReadBack, error: mealReadError } = await userClient
        .from('meals')
        .select('reminder_time, reminder_enabled')
        .eq('id', meal!.id)
        .single()
      assert.strictEqual(mealReadError, null)
      assert.strictEqual(String(mealReadBack?.reminder_time).slice(0, 5), '08:30')
      assert.strictEqual(mealReadBack?.reminder_enabled, true)

      // 6. notification_preferences upsert, exactly like saveMealReminders.
      const { error: prefsError } = await userClient.from('notification_preferences').upsert(
        { user_id: userId, reminders_enabled: true, timezone: 'UTC', updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      assert.strictEqual(prefsError, null, `Notification preferences upsert must not be rejected by RLS: ${prefsError?.message}`)
    })
  } finally {
    if (mealIds.length > 0) await admin.from('foods').delete().in('meal_id', mealIds)
    if (mealIds.length > 0) await admin.from('meals').delete().in('id', mealIds)
    if (planId) await admin.from('diet_plans').delete().eq('id', planId)
  }
})

test('diet_plans_one_active_per_user: a second active plan cannot coexist with an existing active plan for the same user', async () => {
  const planIds: string[] = []

  try {
    await withAuthenticatedUser(async (userClient, userId) => {
      const { data: firstPlan, error: firstError } = await userClient
        .from('diet_plans')
        .insert({
          user_id: userId,
          name: 'First Plan',
          calories_target: 2000,
          protein_target: 150,
          carbs_target: 200,
          fat_target: 60,
          is_active: true,
          plan_source: 'user_created'
        })
        .select()
        .single()
      assert.strictEqual(firstError, null)
      planIds.push(firstPlan!.id as string)

      const { error: secondError } = await userClient.from('diet_plans').insert({
        user_id: userId,
        name: 'Second Plan',
        calories_target: 2000,
        protein_target: 150,
        carbs_target: 200,
        fat_target: 60,
        is_active: true,
        plan_source: 'user_created'
      })
      // The unique diet_plans_one_active_per_user index is exactly what
      // createManualDietPlan's "insert inactive, deactivate old, activate
      // new" ordering (see the plan doc) exists to respect.
      assert.ok(secondError, 'A second concurrently-active plan for the same user must be rejected')
    })
  } finally {
    if (planIds.length > 0) await admin.from('diet_plans').delete().in('id', planIds)
  }
})
