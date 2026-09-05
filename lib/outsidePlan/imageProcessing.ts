// Server-side image normalization for the food scanner.
//
// Not server-only: this module reads no secret (unlike lib/images/pexels.ts,
// which guards PEXELS_API_KEY) - it only transforms raw buffers with sharp,
// a native Node addon that cannot bundle into a browser build regardless.
// An unconditional `import 'server-only'` would also throw under plain
// `node --test` (see lib/images/serverOnly.test.ts's source-text-only
// testing convention for modules that DO hold a secret), which is why this
// file stays directly importable by its own unit tests.
//
// Every accepted upload, regardless of its original format, is re-encoded
// through this single path before it is ever stored or sent to a vision AI
// provider (Question 3/13):
//   - auto-rotated using the EXIF orientation tag, THEN
//   - resized to fit within FOOD_SCAN_MAX_DIMENSION_PX, THEN
//   - re-encoded to plain JPEG with no metadata block at all.
//
// sharp's .jpeg() output carries no EXIF/ICC/XMP data unless .withMetadata()
// is explicitly called - it is not called here, which is what guarantees
// GPS (and every other EXIF field) cannot survive into the stored/
// AI-submitted image. .rotate() with no arguments must run BEFORE that
// happens, since orientation lives in the EXIF block being discarded - an
// unrotated re-encode would silently produce a sideways photo for any image
// whose camera recorded a non-default orientation.

import sharp from 'sharp'
import { FOOD_SCAN_JPEG_QUALITY, FOOD_SCAN_MAX_DIMENSION_PX } from './constants'

export async function normalizeFoodScanImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: FOOD_SCAN_MAX_DIMENSION_PX,
      height: FOOD_SCAN_MAX_DIMENSION_PX,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: FOOD_SCAN_JPEG_QUALITY })
    .toBuffer()
}
