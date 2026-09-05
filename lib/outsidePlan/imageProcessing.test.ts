import test from 'node:test'
import assert from 'node:assert'
import sharp from 'sharp'
import { normalizeFoodScanImage } from './imageProcessing'
import { FOOD_SCAN_MAX_DIMENSION_PX } from './constants'

// Builds a synthetic JPEG carrying EXIF metadata, including GPS-shaped
// fields - the exact kind of real-world phone-camera photo this module
// must strip before the image is ever stored or sent to a vision AI
// provider (Question 3/13). sharp's typed exif writer only exposes the
// generic IFD0-IFD3 tag dictionaries (no distinct GPS IFD at this API
// level), so the GPS fields are written as IFD0 tags here - what matters
// for this test is that NO exif block of any kind survives normalization,
// which necessarily includes whatever GPS data it carried.
async function makeJpegWithExifAndGps(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .withMetadata({
      exif: {
        IFD0: {
          Make: 'TestCam',
          Software: 'outside-plan-food-scanner-tests',
          GPSLatitude: '40/1,26/1,46/1',
          GPSLongitude: '79/1,58/1,56/1'
        }
      }
    })
    .jpeg()
    .toBuffer()
}

test('the fixture actually carries EXIF/GPS metadata (sanity check on the test setup itself)', async () => {
  const fixture = await makeJpegWithExifAndGps(400, 300)
  const metadata = await sharp(fixture).metadata()
  assert.ok(metadata.exif, 'fixture must carry an EXIF block for this test to be meaningful')
})

test('normalizeFoodScanImage strips all EXIF metadata, including GPS', async () => {
  const fixture = await makeJpegWithExifAndGps(400, 300)
  const normalized = await normalizeFoodScanImage(fixture)
  const metadata = await sharp(normalized).metadata()
  assert.strictEqual(metadata.exif, undefined, 'no EXIF block (which would include GPS) may survive normalization')
  assert.strictEqual(metadata.format, 'jpeg')
})

test('normalizeFoodScanImage resizes an oversized image down to the max dimension', async () => {
  const large = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .jpeg()
    .toBuffer()
  const normalized = await normalizeFoodScanImage(large)
  const metadata = await sharp(normalized).metadata()
  assert.ok(metadata.width! <= FOOD_SCAN_MAX_DIMENSION_PX, `width ${metadata.width} must be <= ${FOOD_SCAN_MAX_DIMENSION_PX}`)
  assert.ok(metadata.height! <= FOOD_SCAN_MAX_DIMENSION_PX, `height ${metadata.height} must be <= ${FOOD_SCAN_MAX_DIMENSION_PX}`)
})

test('normalizeFoodScanImage does not upscale an image already smaller than the max dimension', async () => {
  const small = await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .jpeg()
    .toBuffer()
  const normalized = await normalizeFoodScanImage(small)
  const metadata = await sharp(normalized).metadata()
  assert.strictEqual(metadata.width, 200)
  assert.strictEqual(metadata.height, 150)
})

test('normalizeFoodScanImage always outputs JPEG regardless of input format', async () => {
  const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer()
  const normalized = await normalizeFoodScanImage(png)
  const metadata = await sharp(normalized).metadata()
  assert.strictEqual(metadata.format, 'jpeg')
})
