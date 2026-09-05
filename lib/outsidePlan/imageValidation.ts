// Pure, framework-free validation for a food-scan photo upload. Deliberately
// separate from imageProcessing.ts (which needs sharp/'server-only') so this
// module can be unit-tested with plain buffers and reused anywhere a quick,
// dependency-free check is useful.
//
// Never trusts a client-declared Content-Type or file extension (Question
// 3/13) - the actual bytes are sniffed for a known magic-byte signature.
// This is the same posture the rest of this codebase already takes toward
// client input (e.g. lib/tracking/date.ts never trusts a client-claimed
// date without validating it server-side).

import { FOOD_SCAN_ALLOWED_MIME_TYPES, FOOD_SCAN_MAX_UPLOAD_BYTES, type FoodScanAllowedMimeType } from './constants'

export type ImageValidationResult =
  | { ok: true; mimeType: FoodScanAllowedMimeType }
  | { ok: false; reason: 'too_large' | 'unrecognized_format' | 'empty' }

function startsWith(bytes: Buffer, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false
  }
  return true
}

function asciiAt(bytes: Buffer, offset: number, length: number): string {
  if (bytes.length < offset + length) return ''
  return bytes.toString('ascii', offset, offset + length)
}

// ISO base media file format (used by HEIC/HEIF): bytes 4-7 are literally
// "ftyp", followed by a 4-byte brand. Only the brands Apple's Camera app and
// common HEIC encoders actually emit are accepted - this is intentionally
// narrow rather than accepting every ISOBMFF-derived container (which would
// also match some video formats).
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])

function sniffMimeType(bytes: Buffer): FoodScanAllowedMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') return 'image/webp'
  if (asciiAt(bytes, 4, 4) === 'ftyp' && HEIC_BRANDS.has(asciiAt(bytes, 8, 4))) return 'image/heic'
  return null
}

// The single entry point every upload path (web today, a future mobile
// route handler later) must call before any file bytes are stored,
// processed, or sent to a vision AI provider.
export function validateFoodScanUpload(bytes: Buffer): ImageValidationResult {
  if (bytes.length === 0) return { ok: false, reason: 'empty' }
  if (bytes.length > FOOD_SCAN_MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_large' }

  const mimeType = sniffMimeType(bytes)
  if (!mimeType) return { ok: false, reason: 'unrecognized_format' }
  if (!FOOD_SCAN_ALLOWED_MIME_TYPES.includes(mimeType)) return { ok: false, reason: 'unrecognized_format' }

  return { ok: true, mimeType }
}
