// Strict, provider-agnostic validation for the vision model's structured
// JSON output. This is the single boundary between "text a model produced"
// and "data the rest of the app is allowed to trust" (approved design,
// Question 15: "a strict schema validation layer between AI output and
// database writes... invalid or hallucinated AI output must be rejected").
//
// Any current or future VisionProvider implementation that asks its model
// for this same JSON shape can reuse this file unchanged - it has no
// knowledge of Kimi, HTTP, or Supabase.

import { z } from 'zod'
import {
  FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G,
  FOOD_SCAN_MAX_ITEM_NAME_LENGTH,
  FOOD_SCAN_MAX_ITEMS_PER_ANALYSIS,
  FOOD_SCAN_MAX_MEAL_DESCRIPTION_LENGTH,
  FOOD_SCAN_MAX_NOTES_LENGTH,
  FOOD_SCAN_MAX_PORTION_DESCRIPTION_LENGTH,
  FOOD_SCAN_MAX_WARNING_LENGTH,
  FOOD_SCAN_MAX_WARNINGS_PER_ANALYSIS
} from '@/lib/outsidePlan/constants'
import type { FoodAnalysisResult } from './types'

// A model occasionally omits a nullable key entirely instead of sending an
// explicit `null` - both must normalize identically, so every optional
// field below accepts null OR undefined and collapses to null.
const nullableString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform(v => (v ? v : null))

const confidenceScore = z.number().min(0).max(1).nullish().transform(v => v ?? null)

// The exact JSON shape the prompt (providers/kimi.ts) instructs the model
// to return. Field names are snake_case to match this codebase's existing
// AI-facing JSON convention (lib/diet/generate-diet.ts's `food_id` etc.).
//
// Deliberately NOT `.strict()`: an extra, unexpected top-level key from the
// model (a hallucinated field, or a future prompt-compatible provider that
// includes something we don't ask for) is silently stripped by zod's
// default object parsing rather than failing the whole analysis - "reject
// arbitrary model output from becoming executable content" means never
// acting on an unrecognized field, not "throw away an otherwise-valid
// analysis over one harmless extra key". Everything we DO read is still
// strictly typed, ranged, and length-bounded below.
const RawFoodAnalysisItemSchema = z.object({
  name: z.string().trim().min(1).max(FOOD_SCAN_MAX_ITEM_NAME_LENGTH),
  estimated_weight_g: z.number().min(0).max(FOOD_SCAN_MAX_ESTIMATED_WEIGHT_G).nullish().transform(v => v ?? null),
  estimated_portion_description: nullableString(FOOD_SCAN_MAX_PORTION_DESCRIPTION_LENGTH),
  confidence: confidenceScore,
  notes: nullableString(FOOD_SCAN_MAX_NOTES_LENGTH)
})

const RawFoodAnalysisSchema = z.object({
  is_food_photo: z.boolean(),
  items: z.array(RawFoodAnalysisItemSchema).max(FOOD_SCAN_MAX_ITEMS_PER_ANALYSIS),
  overall_confidence: confidenceScore,
  meal_description: nullableString(FOOD_SCAN_MAX_MEAL_DESCRIPTION_LENGTH),
  warnings: z.array(z.string().trim().max(FOOD_SCAN_MAX_WARNING_LENGTH)).max(FOOD_SCAN_MAX_WARNINGS_PER_ANALYSIS).default([])
})

export type ParseFoodAnalysisResult =
  | { ok: true; result: FoodAnalysisResult }
  | { ok: false; reason: 'json_parse_error' | 'schema_validation_error'; detail: string }

// Takes the raw text content returned by the model (never trusted), parses
// it as JSON, then validates it against the schema above. Never throws -
// every failure mode is a normal return value, since a model producing
// malformed output is an expected, routine occurrence, not an exceptional
// one.
export function parseFoodAnalysisResponse(rawText: string): ParseFoodAnalysisResult {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawText)
  } catch {
    return { ok: false, reason: 'json_parse_error', detail: 'Model response was not valid JSON.' }
  }

  const validation = RawFoodAnalysisSchema.safeParse(parsedJson)
  if (!validation.success) {
    return { ok: false, reason: 'schema_validation_error', detail: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }

  const raw = validation.data
  const result: FoodAnalysisResult = {
    isFoodPhoto: raw.is_food_photo,
    items: raw.items.map(item => ({
      name: item.name,
      estimatedWeightG: item.estimated_weight_g,
      estimatedPortionDescription: item.estimated_portion_description,
      confidence: item.confidence,
      notes: item.notes
    })),
    overallConfidence: raw.overall_confidence,
    mealDescription: raw.meal_description,
    warnings: raw.warnings
  }

  return { ok: true, result }
}
