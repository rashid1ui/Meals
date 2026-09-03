// Integration tests for the production-hardening fixes that touch the live
// database directly (finalize_plan_swap RPC, the manual-plan lock, and
// supplement catalog materialization) - deliberately NOT part of `npm test`
// (requires live credentials and mutates real rows, even though every row
// created here is a synthetic, throwaway test fixture cleaned up in
// `finally`). Run manually with `npm run test:production-hardening` after
// populating .env.local. Follows the exact same pattern as
// tests/integration/manual-plan.test.ts / supplement-db.test.ts: a real,
// disposable auth user, exercising real RLS policies, never touching any
// actual user's data.
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { acquireManualPlanLock, releaseManualPlanLock } from '../../lib/diet/manual-plan-lock'
import { ensureSupplementCatalogRow } from '../../lib/diet/supplement-catalog'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:production-hardening).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withAuthenticatedUser<T>(fn: (userClient: any, userId: string) => Promise<T>): Promise<T> {
  const email = `prod-hardening-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
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

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// --- Item 3: finalize_plan_swap must relink historical (not just today's)
// food_tracking rows, and must activate the new plan atomically. ---

test('finalize_plan_swap relinks food_tracking rows for a HISTORICAL date, not just today - reproduces and verifies the fix for the frozen/name-based relink bug', async () => {
  const planIds: string[] = []
  const mealIds: string[] = []

  try {
    await withAuthenticatedUser(async (userClient, userId) => {
      const { data: chicken, error: chickenError } = await userClient
        .from('food_database')
        .select('*')
        .eq('name', 'Chicken Breast, Raw')
        .eq('is_active', true)
        .single()
      assert.strictEqual(chickenError, null, `Fixture food lookup must succeed: ${chickenError?.message}`)

      // 1. Old plan + meal + food ("before" state).
      const { data: oldPlan, error: oldPlanError } = await userClient
        .from('diet_plans')
        .insert({
          user_id: userId, name: 'Old Plan', calories_target: 2200, protein_target: 160,
          carbs_target: 220, fat_target: 70, is_active: true, plan_source: 'user_created'
        })
        .select().single()
      assert.strictEqual(oldPlanError, null)
      planIds.push(oldPlan!.id)

      const { data: oldMeal, error: oldMealError } = await userClient
        .from('meals')
        .insert({ user_id: userId, diet_plan_id: oldPlan!.id, name: 'Lunch', sort_order: 0, reminder_enabled: true })
        .select().single()
      assert.strictEqual(oldMealError, null)
      mealIds.push(oldMeal!.id)

      const { data: oldFood, error: oldFoodError } = await userClient
        .from('foods')
        .insert({
          user_id: userId, meal_id: oldMeal!.id, name: chicken.name, quantity: 150, unit: chicken.serving_unit,
          calories: 180, protein: 33.75, carbs: 0, fat: 3.9, sort_order: 0
        })
        .select().single()
      assert.strictEqual(oldFoodError, null)

      // 2. Tracking history for TWO dates: a historical one (3 days ago) and
      // today - the exact scenario the old localDate-scoped relink lost.
      const historicalDate = daysAgo(3)
      const todayDate = daysAgo(0)
      for (const trackingDate of [historicalDate, todayDate]) {
        const { error: trackingError } = await userClient.from('food_tracking').insert({
          user_id: userId, tracking_date: trackingDate, food_id: oldFood!.id, meal_id: oldMeal!.id,
          food_name: chicken.name, meal_name: 'Lunch', quantity: 150, calories: 180, protein: 33.75,
          carbs: 0, fat: 3.9, completed: true
        })
        assert.strictEqual(trackingError, null, `Tracking insert for ${trackingDate} must succeed: ${trackingError?.message}`)
      }

      // 3. New plan + meal + food ("after" state, as saveDietPlan builds it).
      const { data: newPlan, error: newPlanError } = await userClient
        .from('diet_plans')
        .insert({
          user_id: userId, name: 'Old Plan', calories_target: 2200, protein_target: 160,
          carbs_target: 220, fat_target: 70, is_active: false, plan_source: 'user_created'
        })
        .select().single()
      assert.strictEqual(newPlanError, null)
      planIds.push(newPlan!.id)

      const { data: newMeal, error: newMealError } = await userClient
        .from('meals')
        .insert({ user_id: userId, diet_plan_id: newPlan!.id, name: 'Lunch', sort_order: 0, reminder_enabled: true })
        .select().single()
      assert.strictEqual(newMealError, null)
      mealIds.push(newMeal!.id)

      const { data: newFood, error: newFoodError } = await userClient
        .from('foods')
        .insert({
          user_id: userId, meal_id: newMeal!.id, name: chicken.name, quantity: 200, unit: chicken.serving_unit,
          calories: 240, protein: 45, carbs: 0, fat: 5.2, sort_order: 0
        })
        .select().single()
      assert.strictEqual(newFoodError, null)

      // 4. Call the real RPC with the real old-id -> new-id mapping.
      const { data: swapResult, error: swapError } = await userClient.rpc('finalize_plan_swap', {
        p_old_plan_id: oldPlan!.id,
        p_new_plan_id: newPlan!.id,
        p_meal_id_map: [{ old_id: oldMeal!.id, new_id: newMeal!.id }],
        p_food_id_map: [{ old_id: oldFood!.id, new_id: newFood!.id, new_meal_id: newMeal!.id }]
      })
      assert.strictEqual(swapError, null, `finalize_plan_swap must succeed: ${swapError?.message}`)
      assert.strictEqual(swapResult.relinkedByFood, 2, 'both the historical AND today tracking rows must be relinked')

      // 5. Verify: BOTH tracking rows (historical and today) now point at
      // the NEW food/meal ids - the exact assertion that would have failed
      // under the old today-only relink logic for the historical row.
      const { data: trackingRows, error: readError } = await userClient
        .from('food_tracking')
        .select('tracking_date, food_id, meal_id')
        .eq('user_id', userId)
        .order('tracking_date')
      assert.strictEqual(readError, null)
      assert.strictEqual(trackingRows!.length, 2)
      for (const row of trackingRows!) {
        assert.strictEqual(row.food_id, newFood!.id, `tracking row for ${row.tracking_date} must be relinked to the new food id`)
        assert.strictEqual(row.meal_id, newMeal!.id, `tracking row for ${row.tracking_date} must be relinked to the new meal id`)
      }

      // 6. Verify: old plan/meal deleted, new plan active - the atomic swap
      // completed fully.
      const { data: oldPlanCheck } = await userClient.from('diet_plans').select('id').eq('id', oldPlan!.id).maybeSingle()
      assert.strictEqual(oldPlanCheck, null, 'old plan must be deleted after a successful swap')
      const { data: newPlanCheck, error: newPlanCheckError } = await userClient
        .from('diet_plans').select('is_active').eq('id', newPlan!.id).single()
      assert.strictEqual(newPlanCheckError, null)
      assert.strictEqual(newPlanCheck!.is_active, true, 'new plan must be active after a successful swap')
    })
  } finally {
    await admin.from('food_tracking').delete().in('meal_id', mealIds)
    if (mealIds.length > 0) await admin.from('foods').delete().in('meal_id', mealIds)
    if (mealIds.length > 0) await admin.from('meals').delete().in('id', mealIds)
    if (planIds.length > 0) await admin.from('diet_plans').delete().in('id', planIds)
  }
})

test('finalize_plan_swap never leaves zero active plans: an invalid/foreign plan id rolls back the entire transaction', async () => {
  const planIds: string[] = []

  try {
    await withAuthenticatedUser(async (userClient, userId) => {
      const { data: oldPlan, error: oldPlanError } = await userClient
        .from('diet_plans')
        .insert({
          user_id: userId, name: 'Only Plan', calories_target: 2000, protein_target: 150,
          carbs_target: 200, fat_target: 60, is_active: true, plan_source: 'user_created'
        })
        .select().single()
      assert.strictEqual(oldPlanError, null)
      planIds.push(oldPlan!.id)

      // A non-existent new_plan_id - the function's own ownership check must
      // reject this before touching anything.
      const fakeNewPlanId = '00000000-0000-0000-0000-000000000000'
      const { error: swapError } = await userClient.rpc('finalize_plan_swap', {
        p_old_plan_id: oldPlan!.id,
        p_new_plan_id: fakeNewPlanId,
        p_meal_id_map: [],
        p_food_id_map: []
      })
      assert.ok(swapError, 'finalize_plan_swap must reject a new_plan_id the caller does not own')

      // The old plan must still be exactly as it was - active, not deleted.
      const { data: stillThere, error: readError } = await userClient
        .from('diet_plans').select('is_active').eq('id', oldPlan!.id).single()
      assert.strictEqual(readError, null)
      assert.strictEqual(stillThere!.is_active, true, 'old plan must remain active - the failed swap must not have partially applied')
    })
  } finally {
    if (planIds.length > 0) await admin.from('diet_plans').delete().in('id', planIds)
  }
})

// --- Item 5: soft-deleted foods must never be silently reused. ---

test('an is_active=false food_database row is excluded by the active-only lookup createFoodDatabaseEntry now uses', async () => {
  const testName = `ZZZ_TEST_HARNESS Inactive Food ${Date.now()}`
  let foodId: string | null = null

  try {
    await withAuthenticatedUser(async userClient => {
      const { data: inserted, error: insertError } = await userClient
        .from('food_database')
        .insert({
          name: testName, category: 'protein', serving_size: 100, serving_unit: 'grams',
          calories: 100, protein: 20, carbs: 0, fat: 2, is_active: false
        })
        .select('id').single()
      assert.strictEqual(insertError, null, `Fixture insert must succeed: ${insertError?.message}`)
      foodId = inserted!.id

      // The exact query shape createFoodDatabaseEntry's fixed "active-only"
      // lookup uses.
      const { data: activeLookup, error: activeLookupError } = await userClient
        .from('food_database')
        .select('id')
        .ilike('name', testName)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      assert.strictEqual(activeLookupError, null)
      assert.strictEqual(activeLookup, null, 'an inactive row must never be returned by the active-only reuse lookup')

      // The exact query shape the new "detect an inactive collision" check
      // uses - this IS expected to find it, so the caller can return a
      // clear error instead of hitting a raw unique-constraint failure.
      const { data: inactiveLookup, error: inactiveLookupError } = await userClient
        .from('food_database')
        .select('id')
        .ilike('name', testName)
        .eq('is_active', false)
        .limit(1)
        .maybeSingle()
      assert.strictEqual(inactiveLookupError, null)
      assert.ok(inactiveLookup, 'the inactive-name detection query must find the soft-deleted row')
    })
  } finally {
    if (foodId) await admin.from('food_database').delete().eq('id', foodId)
  }
})

// --- Item 6: supplement catalog materialization for the Manual Builder. ---

test('ensureSupplementCatalogRow creates a usable, correctly-shaped whey food_database row and is idempotent on repeat calls', async () => {
  let foodId: string | null = null

  try {
    await withAuthenticatedUser(async userClient => {
      const supp = {
        type: 'whey' as const,
        brand: 'ZZZ_TEST_HARNESS',
        serving_label: '1 scoop',
        amount_per_serving_g: 27
      }

      const first = await ensureSupplementCatalogRow(userClient, supp)
      assert.ok('data' in first, `First call must succeed: ${'error' in first ? first.error : ''}`)
      if (!('data' in first)) return
      foodId = first.data.foodId
      assert.strictEqual(first.data.category, 'supplement')
      assert.strictEqual(first.data.protein_type, 'supplement')
      // 27g protein/scoop -> 108 kcal/scoop (4 kcal/g), stored per-100g at
      // the canonical 30g serving basis - same math computeSupplementMacros
      // already has dedicated unit tests for; this just confirms the row
      // that actually lands in food_database carries it through correctly.
      assert.ok(first.data.protein > 0, 'whey must carry real, non-zero protein - never silently zeroed')
      assert.ok(first.data.calories > 0, 'whey must carry real, non-zero calories')

      const second = await ensureSupplementCatalogRow(userClient, supp)
      assert.ok('data' in second, `Second (repeat) call must succeed: ${'error' in second ? second.error : ''}`)
      if ('data' in second) {
        assert.strictEqual(second.data.foodId, first.data.foodId, 'the same configuration must reuse the same row, not create a duplicate')
      }
    })
  } finally {
    if (foodId) await admin.from('food_database').delete().eq('id', foodId)
  }
})

test('ensureSupplementCatalogRow creates a zero-macro creatine row that never affects targets', async () => {
  let foodId: string | null = null

  try {
    await withAuthenticatedUser(async userClient => {
      const result = await ensureSupplementCatalogRow(userClient, {
        type: 'creatine',
        brand: 'ZZZ_TEST_HARNESS',
        serving_label: '1 scoop',
        amount_per_serving_g: 5
      })
      assert.ok('data' in result, `Creatine row creation must succeed: ${'error' in result ? result.error : ''}`)
      if (!('data' in result)) return
      foodId = result.data.foodId
      assert.strictEqual(result.data.calories, 0)
      assert.strictEqual(result.data.protein, 0)
      assert.strictEqual(result.data.carbs, 0)
      assert.strictEqual(result.data.fat, 0)
    })
  } finally {
    if (foodId) await admin.from('food_database').delete().eq('id', foodId)
  }
})

// --- Item 8: dedicated manual-plan lock. ---

test('acquireManualPlanLock rejects a second concurrent acquire for the same user, and release allows a fresh acquire', async () => {
  await withAuthenticatedUser(async (userClient, userId) => {
    const first = await acquireManualPlanLock(userClient, userId)
    assert.strictEqual(first.ok, true, `First acquire must succeed: ${'error' in first ? first.error : ''}`)

    // Simulates a rapid double-click / retried request while the first
    // "request" is still (conceptually) in flight - the lock is still held.
    const second = await acquireManualPlanLock(userClient, userId)
    assert.strictEqual(second.ok, false, 'a second concurrent acquire must be rejected, not silently allowed')

    await releaseManualPlanLock(userClient, userId)

    // Retry after the first attempt finished (released) must succeed - the
    // lock is not a one-way, permanently-stuck gate.
    const third = await acquireManualPlanLock(userClient, userId)
    assert.strictEqual(third.ok, true, 'a fresh acquire after release must succeed (successful retry after previous attempt)')
    await releaseManualPlanLock(userClient, userId)
  })
})

// --- Migration 0026: finalize_plan_swap must ignore relink-map entries whose
// old_id does not belong to the plan being retired (audit fix M5). ---

test('finalize_plan_swap ignores a relink pair whose old_id is not a food of the old plan', async () => {
  const planIds: string[] = []
  const mealIds: string[] = []

  try {
    await withAuthenticatedUser(async (userClient, userId) => {
      const trackDate = daysAgo(2)

      // A "foreign" plan+meal+food+tracking row that must NOT be touched.
      const { data: otherPlan } = await userClient.from('diet_plans').insert({
        user_id: userId, name: 'Other', calories_target: 2000, protein_target: 150,
        carbs_target: 200, fat_target: 60, is_active: false, plan_source: 'user_created'
      }).select().single()
      planIds.push(otherPlan!.id)
      const { data: otherMeal } = await userClient.from('meals').insert({
        user_id: userId, diet_plan_id: otherPlan!.id, name: 'M', sort_order: 0, reminder_enabled: true
      }).select().single()
      mealIds.push(otherMeal!.id)
      const { data: otherFood } = await userClient.from('foods').insert({
        user_id: userId, meal_id: otherMeal!.id, name: 'X', quantity: 100, unit: 'grams',
        calories: 100, protein: 10, carbs: 5, fat: 2, sort_order: 0
      }).select().single()
      await userClient.from('food_tracking').insert({
        user_id: userId, tracking_date: trackDate, food_id: otherFood!.id, meal_id: otherMeal!.id,
        food_name: 'X', meal_name: 'M', quantity: 100, calories: 100, protein: 10, carbs: 5, fat: 2, completed: true
      })

      // The real old -> new swap (a genuine plan replacement).
      const { data: oldPlan } = await userClient.from('diet_plans').insert({
        user_id: userId, name: 'Old', calories_target: 2000, protein_target: 150,
        carbs_target: 200, fat_target: 60, is_active: true, plan_source: 'user_created'
      }).select().single()
      planIds.push(oldPlan!.id)
      const { data: oldMeal } = await userClient.from('meals').insert({
        user_id: userId, diet_plan_id: oldPlan!.id, name: 'L', sort_order: 0, reminder_enabled: true
      }).select().single()
      mealIds.push(oldMeal!.id)
      const { data: oldFood } = await userClient.from('foods').insert({
        user_id: userId, meal_id: oldMeal!.id, name: 'Y', quantity: 100, unit: 'grams',
        calories: 200, protein: 20, carbs: 10, fat: 4, sort_order: 0
      }).select().single()
      await userClient.from('food_tracking').insert({
        user_id: userId, tracking_date: trackDate, food_id: oldFood!.id, meal_id: oldMeal!.id,
        food_name: 'Y', meal_name: 'L', quantity: 100, calories: 200, protein: 20, carbs: 10, fat: 4, completed: true
      })

      const { data: newPlan } = await userClient.from('diet_plans').insert({
        user_id: userId, name: 'Old', calories_target: 2000, protein_target: 150,
        carbs_target: 200, fat_target: 60, is_active: false, plan_source: 'user_created'
      }).select().single()
      planIds.push(newPlan!.id)
      const { data: newMeal } = await userClient.from('meals').insert({
        user_id: userId, diet_plan_id: newPlan!.id, name: 'L', sort_order: 0, reminder_enabled: true
      }).select().single()
      mealIds.push(newMeal!.id)
      const { data: newFood } = await userClient.from('foods').insert({
        user_id: userId, meal_id: newMeal!.id, name: 'Y', quantity: 120, unit: 'grams',
        calories: 240, protein: 24, carbs: 12, fat: 5, sort_order: 0
      }).select().single()

      // Map includes a MALICIOUS/STALE pair: otherFood -> newFood. The hardened
      // function must skip it because otherFood is not under oldPlan.
      const { error: swapError } = await userClient.rpc('finalize_plan_swap', {
        p_old_plan_id: oldPlan!.id,
        p_new_plan_id: newPlan!.id,
        p_meal_id_map: [{ old_id: oldMeal!.id, new_id: newMeal!.id }],
        p_food_id_map: [
          { old_id: oldFood!.id, new_id: newFood!.id, new_meal_id: newMeal!.id },
          { old_id: otherFood!.id, new_id: newFood!.id, new_meal_id: newMeal!.id }
        ]
      })
      assert.strictEqual(swapError, null, `swap must succeed: ${swapError?.message}`)

      // The genuine row was relinked...
      const { data: relinked } = await userClient.from('food_tracking')
        .select('food_id, meal_id').eq('user_id', userId).eq('food_name', 'Y').single()
      assert.strictEqual(relinked!.food_id, newFood!.id)

      // ...but the FOREIGN row was left completely alone.
      const { data: untouched } = await userClient.from('food_tracking')
        .select('food_id, meal_id').eq('user_id', userId).eq('food_name', 'X').single()
      assert.strictEqual(untouched!.food_id, otherFood!.id, 'a relink pair for a food outside the old plan must be ignored')
      assert.strictEqual(untouched!.meal_id, otherMeal!.id)
    })
  } finally {
    await admin.from('food_tracking').delete().in('meal_id', mealIds)
    if (mealIds.length > 0) await admin.from('foods').delete().in('meal_id', mealIds)
    if (mealIds.length > 0) await admin.from('meals').delete().in('id', mealIds)
    if (planIds.length > 0) await admin.from('diet_plans').delete().in('id', planIds)
  }
})
