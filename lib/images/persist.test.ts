import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistImage } from './persist'
import type { ResolvedImage } from './types'

// Minimal chainable fake of the subset of the Supabase client persistImage uses:
//   from(t).select(c).eq(k,v).maybeSingle()  -> { data, error }
//   from(t).update(patch).eq(k,v)            -> { error }
function fakeAdmin(current: { image_url: string | null; image_status: string | null } | null) {
  const updates: Record<string, unknown>[] = []
  const client = {
    updates,
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: current, error: null }) }
            }
          }
        },
        update(patch: Record<string, unknown>) {
          updates.push(patch)
          return { eq: async () => ({ error: null }) }
        }
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

const RESOLVED: ResolvedImage = {
  url: 'https://images.pexels.com/photos/1/x.jpg',
  alt: 'photo',
  attribution: { source: 'pexels', photographer: 'P' },
  status: 'resolved'
}

test('stores the image + status + checked_at when the row has no image yet', async () => {
  const admin = fakeAdmin({ image_url: null, image_status: null })
  const res = await persistImage(admin, 'food_database', 'id1', RESOLVED)
  assert.deepEqual(res, { outcome: 'stored', status: 'resolved' })
  assert.equal(admin.updates[0].image_url, RESOLVED.url)
  assert.equal(admin.updates[0].image_status, 'resolved')
  assert.ok(typeof admin.updates[0].image_checked_at === 'string')
})

test('NEVER overwrites a user_provided image', async () => {
  const admin = fakeAdmin({ image_url: 'https://x/y.jpg', image_status: 'user_provided' })
  const res = await persistImage(admin, 'meals', 'id2', RESOLVED)
  assert.deepEqual(res, { outcome: 'skipped', reason: 'user_provided' })
  assert.equal(admin.updates.length, 0)
})

test('does not overwrite an existing image unless force', async () => {
  const admin = fakeAdmin({ image_url: 'https://x/y.jpg', image_status: 'resolved' })
  assert.deepEqual(await persistImage(admin, 'user_supplements', 'id3', RESOLVED), {
    outcome: 'skipped',
    reason: 'already_has_image'
  })
  assert.equal(admin.updates.length, 0)

  const forced = fakeAdmin({ image_url: 'https://x/y.jpg', image_status: 'resolved' })
  assert.deepEqual(await persistImage(forced, 'user_supplements', 'id3', RESOLVED, { force: true }), {
    outcome: 'stored',
    status: 'resolved'
  })
})

test('a null resolution records status=unresolved + checked_at, leaves image_url NULL', async () => {
  const admin = fakeAdmin({ image_url: null, image_status: 'pending' })
  const res = await persistImage(admin, 'meals', 'id4', null)
  assert.deepEqual(res, { outcome: 'unresolved' })
  assert.equal(admin.updates[0].image_status, 'unresolved')
  assert.ok(!('image_url' in admin.updates[0]))
})
