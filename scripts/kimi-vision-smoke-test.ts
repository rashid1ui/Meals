/**
 * Controlled, developer-run smoke test for the Kimi K2.6 vision layer
 * (Phase 3). NOT part of the automated test suite - this makes one real,
 * billed call to the live Moonshot API using the KIMI_API_KEY configured in
 * .env.local, so it must stay explicit and manually triggered, never run
 * automatically (Phase 3 instructions section 14).
 *
 * Exercises the exact same code path production will use: read image bytes
 * -> validate (lib/outsidePlan/imageValidation.ts) -> normalize/strip EXIF
 * (lib/outsidePlan/imageProcessing.ts) -> analyzeFoodImage
 * (lib/ai-vision, which resolves to the Kimi provider).
 *
 * Usage:
 *   npm run smoke:kimi-vision -- /path/to/a/real/food/photo.jpg
 *
 * Never prints KIMI_API_KEY, and never prints image bytes/base64.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

import { readFileSync } from 'node:fs'
import { validateFoodScanUpload } from '../lib/outsidePlan/imageValidation'
import { normalizeFoodScanImage } from '../lib/outsidePlan/imageProcessing'
import { analyzeFoodImage, isVisionProviderConfigured } from '../lib/ai-vision'

async function main() {
  const imagePath = process.argv[2]
  if (!imagePath) {
    console.error('Usage: npm run smoke:kimi-vision -- /path/to/a/real/food/photo.jpg')
    process.exit(1)
  }

  if (!isVisionProviderConfigured()) {
    console.error('KIMI_API_KEY is not set (checked via lib/ai-vision). Add it to .env.local and try again.')
    process.exit(1)
  }

  console.log(`Reading ${imagePath}...`)
  const rawBytes = readFileSync(imagePath)

  const validation = validateFoodScanUpload(rawBytes)
  if (!validation.ok) {
    console.error(`Image failed validation: ${validation.reason}`)
    process.exit(1)
  }
  console.log(`Validated as ${validation.mimeType} (${rawBytes.length} bytes).`)

  console.log('Normalizing (resize, EXIF strip, JPEG re-encode)...')
  const normalized = await normalizeFoodScanImage(rawBytes)
  console.log(`Normalized to ${normalized.length} bytes.`)

  console.log('Calling the vision provider (this makes a real, billed Kimi API request)...')
  const outcome = await analyzeFoodImage({ imageBuffer: normalized, mimeType: 'image/jpeg' })

  console.log('\n--- Outcome ---')
  console.log('model:', outcome.model)
  console.log('latencyMs:', outcome.latencyMs)

  if (outcome.error) {
    console.log('error.code:', outcome.error.code)
    console.log('error.message:', outcome.error.message)
    process.exit(0)
  }

  const result = outcome.result!
  console.log('isFoodPhoto:', result.isFoodPhoto)
  console.log('overallConfidence:', result.overallConfidence)
  console.log('mealDescription:', result.mealDescription)
  console.log('warnings:', result.warnings)
  console.log(`items (${result.items.length}):`)
  for (const item of result.items) {
    console.log(`  - ${item.name} | estimatedWeightG=${item.estimatedWeightG} | confidence=${item.confidence} | portion="${item.estimatedPortionDescription}" | notes="${item.notes}"`)
  }
}

main().catch(err => {
  console.error('Smoke test crashed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
