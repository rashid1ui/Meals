import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveFoodImage, anyFoodHasImage } from './foodImage'

const PEXELS = {
  image_url: 'https://images.pexels.com/photos/1234/pexels-photo-1234.jpeg?auto=compress&w=400&h=400',
  image_alt: 'Close-up of cooked chicken breast',
  image_attribution: {
    source: 'pexels',
    photographer: 'Jane Doe',
    photographer_url: 'https://www.pexels.com/@jane-doe',
    source_url: 'https://www.pexels.com/photo/1234'
  }
}

test('resolveFoodImage - returns the stored photo, alt and credit when present', () => {
  const r = resolveFoodImage(PEXELS, 'Chicken Breast, Cooked')
  assert.ok(r)
  assert.equal(r!.src, PEXELS.image_url)
  assert.equal(r!.alt, 'Close-up of cooked chicken breast')
  assert.equal(r!.credit, 'Photo: Jane Doe / Pexels')
  assert.equal(r!.creditUrl, 'https://www.pexels.com/@jane-doe')
})

test('resolveFoodImage - falls back to a generated alt when none was stored', () => {
  const r = resolveFoodImage({ ...PEXELS, image_alt: null }, 'Rolled Oats, Dry')
  assert.equal(r!.alt, 'Photo of Rolled Oats, Dry')
})

test('resolveFoodImage - returns null when there is no stored image (caller uses the emoji fallback)', () => {
  assert.equal(resolveFoodImage(null, 'Honey'), null)
  assert.equal(resolveFoodImage(undefined, 'Honey'), null)
  assert.equal(resolveFoodImage({}, 'Honey'), null)
  assert.equal(resolveFoodImage({ image_url: '' }, 'Honey'), null)
  assert.equal(resolveFoodImage({ image_url: '   ' }, 'Honey'), null)
})

test('resolveFoodImage - rejects a non-https url rather than emitting an unsafe <img src>', () => {
  assert.equal(resolveFoodImage({ image_url: 'http://insecure.example/x.jpg' }, 'Honey'), null)
  assert.equal(resolveFoodImage({ image_url: 'javascript:alert(1)' }, 'Honey'), null)
  assert.equal(resolveFoodImage({ image_url: '/local/only.jpg' }, 'Honey'), null)
})

test('resolveFoodImage - degrades gracefully when only partial attribution was stored', () => {
  const r = resolveFoodImage({ image_url: PEXELS.image_url, image_attribution: { source: 'pexels' } }, 'Banana, Raw')
  assert.equal(r!.credit, 'Photo via Pexels')
  assert.equal(r!.creditUrl, null)
})

test('resolveFoodImage - no attribution object at all still yields a usable image, just no credit', () => {
  const r = resolveFoodImage({ image_url: PEXELS.image_url }, 'Banana, Raw')
  assert.ok(r)
  assert.equal(r!.credit, null)
  assert.equal(r!.creditUrl, null)
})

test('anyFoodHasImage - true only when at least one row carries a usable https image', () => {
  assert.equal(anyFoodHasImage([null, {}, { image_url: '' }]), false)
  assert.equal(anyFoodHasImage([{}, PEXELS]), true)
  assert.equal(anyFoodHasImage([{ image_url: 'http://nope' }]), false)
})
