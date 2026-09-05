// Public entry point for the vision layer. Every caller (the future scan
// server action, lib/outsidePlan/scanAnalysis.ts's caching/logging
// orchestration, tests) imports ONLY from here - never reaching into
// providers/kimi.ts directly - so switching the active provider later is a
// one-line change in this file, not a search-and-replace across the app
// (approved design, Question 4/12: "Kimi is an implementation detail, not
// hard-coded throughout the application").

import type { FoodAnalysisRequest, VisionAnalysisOutcome, VisionProvider } from './types'
import { kimiVisionProvider } from './providers/kimi'

const PROVIDERS: Record<string, VisionProvider> = {
  kimi: kimiVisionProvider
}

const DEFAULT_PROVIDER_NAME = 'kimi'

function resolveProvider(): VisionProvider {
  const requested = process.env.VISION_AI_PROVIDER?.trim().toLowerCase() || DEFAULT_PROVIDER_NAME
  return PROVIDERS[requested] ?? PROVIDERS[DEFAULT_PROVIDER_NAME]
}

export function isVisionProviderConfigured(): boolean {
  return resolveProvider().isConfigured()
}

export function analyzeFoodImage(request: FoodAnalysisRequest): Promise<VisionAnalysisOutcome> {
  return resolveProvider().analyzeFoodImage(request)
}

export type {
  FoodAnalysisItem,
  FoodAnalysisRequest,
  FoodAnalysisResult,
  VisionAnalysisError,
  VisionAnalysisOutcome,
  VisionErrorCode,
  VisionProvider
} from './types'
