// Integration test - hits the real Supabase project end to end, as actual
// authenticated users, exercising the same storage.objects RLS policies
// production traffic goes through. Deliberately NOT part of `npm test`
// (requires live credentials and mutates real Storage objects/rows) - run
// manually with `npm run test:food-scan-storage-rls` after populating
// .env.local. Mirrors tests/integration/supplement-tracking-rls.test.ts's
// own pattern, for the food-scan-photos bucket (supabase/migrations/
// 0032_food_scan_storage.sql, 0033_food_scan_events_image_path.sql) and the
// sweep functions in lib/outsidePlan/storage.ts.
import test from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import sharp from 'sharp'
import {
  deleteFoodScanImage,
  getFoodScanImageSignedUrl,
  pruneOrphanedFoodScanUploads,
  sweepExpiredFoodScanPhotos,
  uploadFoodScanImage
} from '../../lib/outsidePlan/storage'
import { FOOD_SCAN_BUCKET, FOOD_SCAN_RETENTION_DAYS } from '../../lib/outsidePlan/constants'

config({ path: '.env.local' })

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running (npm run test:food-scan-storage-rls).'
  )
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function tinyTestJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 5, g: 5, b: 5 } } })
    .jpeg()
    .toBuffer()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createSignedInUser(): Promise<{ client: any; userId: string; cleanup: () => Promise<void> }> {
  const email = `food-scan-storage-rls-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
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

test('a user can upload, read via signed URL, and delete their own food scan photo', async () => {
  const user = await createSignedInUser()
  try {
    const image = await tinyTestJpeg()
    const uploadResult = await uploadFoodScanImage(user.client, user.userId, image)
    assert.strictEqual(uploadResult.ok, true, `upload must succeed: ${!uploadResult.ok && uploadResult.error}`)
    if (!uploadResult.ok) return

    const signedUrl = await getFoodScanImageSignedUrl(user.client, uploadResult.path)
    assert.ok(signedUrl, 'signed URL must be generated for the owner')

    const response = await fetch(signedUrl!)
    assert.strictEqual(response.status, 200, 'the signed URL must actually serve the uploaded bytes')

    const deleteResult = await deleteFoodScanImage(user.client, uploadResult.path)
    assert.strictEqual(deleteResult.ok, true)
  } finally {
    await user.cleanup()
  }
})

test('a user cannot upload into another user\'s folder prefix', async () => {
  const owner = await createSignedInUser()
  const intruder = await createSignedInUser()
  try {
    const image = await tinyTestJpeg()
    // Attempt to write directly under the owner's folder using the
    // intruder's own authenticated client.
    const forgedPath = `${owner.userId}/${crypto.randomUUID()}.jpg`
    const { error } = await intruder.client.storage.from(FOOD_SCAN_BUCKET).upload(forgedPath, image, { contentType: 'image/jpeg' })
    assert.ok(error, 'the insert RLS policy must reject a path whose folder prefix is not the caller\'s own auth.uid()')
  } finally {
    await owner.cleanup()
    await intruder.cleanup()
  }
})

test('a user cannot read or delete another user\'s food scan photo', async () => {
  const owner = await createSignedInUser()
  const intruder = await createSignedInUser()
  try {
    const image = await tinyTestJpeg()
    const uploadResult = await uploadFoodScanImage(owner.client, owner.userId, image)
    assert.strictEqual(uploadResult.ok, true)
    if (!uploadResult.ok) return

    // download() as the intruder must fail - select RLS denies it.
    const { data: intruderDownload, error: downloadError } = await intruder.client.storage.from(FOOD_SCAN_BUCKET).download(uploadResult.path)
    assert.ok(downloadError || !intruderDownload, 'another user must not be able to download this object')

    // A signed URL requested BY the intruder for the owner's path must fail
    // (createSignedUrl requires select access, which RLS denies).
    const intruderSignedUrl = await getFoodScanImageSignedUrl(intruder.client, uploadResult.path)
    assert.strictEqual(intruderSignedUrl, null, 'another user must not be able to mint a signed URL for this object')

    // remove() as the intruder must be a no-op - delete RLS denies it, the
    // object must still exist for the owner afterward.
    await intruder.client.storage.from(FOOD_SCAN_BUCKET).remove([uploadResult.path])
    const { data: stillThere } = await owner.client.storage.from(FOOD_SCAN_BUCKET).download(uploadResult.path)
    assert.ok(stillThere, 'the owner\'s object must survive the intruder\'s no-op delete attempt')

    await deleteFoodScanImage(owner.client, uploadResult.path)
  } finally {
    await owner.cleanup()
    await intruder.cleanup()
  }
})

test(`sweepExpiredFoodScanPhotos deletes a photo past the ${FOOD_SCAN_RETENTION_DAYS}-day retention window and preserves the entry row`, async () => {
  const user = await createSignedInUser()
  try {
    const image = await tinyTestJpeg()
    const uploadResult = await uploadFoodScanImage(user.client, user.userId, image)
    assert.strictEqual(uploadResult.ok, true)
    if (!uploadResult.ok) return
    const path = uploadResult.path

    const longExpiredCreatedAt = new Date(Date.now() - (FOOD_SCAN_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString()
    const { data: entry, error: insertError } = await user.client
      .from('outside_plan_food_entries')
      .insert({
        tracking_date: '2026-01-01',
        source: 'ai_scan',
        item_name: 'Retention sweep fixture',
        calories: 500,
        protein: 20,
        carbs: 40,
        fat: 20,
        image_storage_path: path,
        created_at: longExpiredCreatedAt
      })
      .select()
      .single()
    assert.strictEqual(insertError, null, `fixture insert must succeed: ${insertError?.message}`)

    const summary = await sweepExpiredFoodScanPhotos(admin, { limit: 50 })
    assert.ok(summary.deleted >= 1, 'the sweep must delete at least the fixture photo created past the retention window')

    const { data: afterSweep, error: readError } = await user.client
      .from('outside_plan_food_entries')
      .select('id, image_storage_path, image_deleted_at, calories, item_name')
      .eq('id', entry.id)
      .single()
    assert.strictEqual(readError, null)
    assert.strictEqual(afterSweep.image_storage_path, null, 'the path must be cleared once the photo is purged')
    assert.ok(afterSweep.image_deleted_at, 'image_deleted_at must be set')
    assert.strictEqual(afterSweep.calories, 500, 'the nutrition entry itself must survive its photo being purged')
    assert.strictEqual(afterSweep.item_name, 'Retention sweep fixture')

    const { data: objectGone } = await user.client.storage.from(FOOD_SCAN_BUCKET).download(path)
    assert.ok(!objectGone, 'the Storage object itself must actually be gone')

    await user.client.from('outside_plan_food_entries').delete().eq('id', entry.id)
  } finally {
    await user.cleanup()
  }
})

test('pruneOrphanedFoodScanUploads deletes a stale, never-confirmed scan\'s photo', async () => {
  const user = await createSignedInUser()
  try {
    const image = await tinyTestJpeg()
    const uploadResult = await uploadFoodScanImage(user.client, user.userId, image)
    assert.strictEqual(uploadResult.ok, true)
    if (!uploadResult.ok) return
    const path = uploadResult.path

    const staleCreatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48h ago, no resulting_entry_id
    const { data: event, error: insertError } = await user.client
      .from('food_scan_events')
      .insert({ status: 'succeeded', image_hash: 'orphan-fixture-hash', ai_response: { ok: true }, image_storage_path: path, created_at: staleCreatedAt })
      .select()
      .single()
    assert.strictEqual(insertError, null, `fixture insert must succeed: ${insertError?.message}`)

    const summary = await pruneOrphanedFoodScanUploads(admin, { limit: 50 })
    assert.ok(summary.deleted >= 1, 'the sweep must delete at least the fixture orphaned photo')

    const { data: objectGone } = await user.client.storage.from(FOOD_SCAN_BUCKET).download(path)
    assert.ok(!objectGone, 'the orphaned Storage object must actually be gone')

    const { data: afterSweep } = await user.client.from('food_scan_events').select('image_storage_path, ai_response').eq('id', event.id).single()
    assert.strictEqual(afterSweep?.image_storage_path, null)
    assert.strictEqual(afterSweep?.ai_response, null)
  } finally {
    await user.cleanup()
  }
})
