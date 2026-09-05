import test from 'node:test'
import assert from 'node:assert'
import { validateFoodScanUpload } from './imageValidation'
import { FOOD_SCAN_MAX_UPLOAD_BYTES } from './constants'

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const WEBP_MAGIC = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from([0, 0, 0, 0])])
const HEIC_MAGIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.from([0, 0, 0, 0])])

test('accepts a valid JPEG', () => {
  const result = validateFoodScanUpload(JPEG_MAGIC)
  assert.strictEqual(result.ok, true)
  if (result.ok) assert.strictEqual(result.mimeType, 'image/jpeg')
})

test('accepts a valid PNG', () => {
  const result = validateFoodScanUpload(PNG_MAGIC)
  assert.strictEqual(result.ok, true)
  if (result.ok) assert.strictEqual(result.mimeType, 'image/png')
})

test('accepts a valid WebP', () => {
  const result = validateFoodScanUpload(WEBP_MAGIC)
  assert.strictEqual(result.ok, true)
  if (result.ok) assert.strictEqual(result.mimeType, 'image/webp')
})

test('accepts a valid HEIC', () => {
  const result = validateFoodScanUpload(HEIC_MAGIC)
  assert.strictEqual(result.ok, true)
  if (result.ok) assert.strictEqual(result.mimeType, 'image/heic')
})

test('rejects a spoofed file whose bytes do not match its claimed type (a text file renamed .jpg)', () => {
  const fakeJpeg = Buffer.from('this is just plain text pretending to be an image, not real JPEG bytes')
  const result = validateFoodScanUpload(fakeJpeg)
  assert.strictEqual(result.ok, false)
  if (!result.ok) assert.strictEqual(result.reason, 'unrecognized_format')
})

test('rejects a spoofed file carrying a PDF signature', () => {
  const fakePdf = Buffer.from('%PDF-1.4 pretending to be an image')
  const result = validateFoodScanUpload(fakePdf)
  assert.strictEqual(result.ok, false)
  if (!result.ok) assert.strictEqual(result.reason, 'unrecognized_format')
})

test('rejects an empty file', () => {
  const result = validateFoodScanUpload(Buffer.alloc(0))
  assert.strictEqual(result.ok, false)
  if (!result.ok) assert.strictEqual(result.reason, 'empty')
})

test('rejects a file over the size ceiling even if it has valid JPEG magic bytes', () => {
  const oversized = Buffer.concat([JPEG_MAGIC, Buffer.alloc(FOOD_SCAN_MAX_UPLOAD_BYTES)])
  const result = validateFoodScanUpload(oversized)
  assert.strictEqual(result.ok, false)
  if (!result.ok) assert.strictEqual(result.reason, 'too_large')
})

test('accepts a file exactly at the size ceiling', () => {
  const atLimit = Buffer.concat([JPEG_MAGIC, Buffer.alloc(FOOD_SCAN_MAX_UPLOAD_BYTES - JPEG_MAGIC.length)])
  const result = validateFoodScanUpload(atLimit)
  assert.strictEqual(result.ok, true)
})

test('rejects a non-HEIC ISOBMFF container (an mp4 video sharing the ftyp box structure)', () => {
  const fakeMp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from('isom'), Buffer.from([0, 0, 0, 0])])
  const result = validateFoodScanUpload(fakeMp4)
  assert.strictEqual(result.ok, false)
  if (!result.ok) assert.strictEqual(result.reason, 'unrecognized_format')
})
