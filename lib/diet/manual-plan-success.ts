// Pure decision helper for the manual onboarding meal builder's success
// screen. No React, no Supabase, no 'use client'/'server-only' - unit-testable
// in a plain `node --test` run.
//
// The rule it enforces: the "Your Meal Plan Is Ready" success screen may be
// shown ONLY after createManualDietPlan (app/onboarding/manual-actions.ts) has
// returned a confirmed success result. That result now carries the id of the
// persisted, active `diet_plans` row (`dietPlanId`) - returned only once every
// DB write (plan + meals + foods, the active-plan swap, the profile update)
// has succeeded. A missing/empty id means the plan was never confirmed saved,
// so success must not be shown - the caller routes to its error state instead.
//
// `createdMealCount` is a secondary sanity check: a real manual plan always
// persists at least its (3-6) meal rows, so zero meals alongside a plan id
// would indicate a corrupted/hand-edited resumed draft rather than a genuine
// completion.
export function canShowManualPlanSuccess(input: {
  dietPlanId: string | null | undefined
  createdMealCount: number
}): boolean {
  return (
    typeof input.dietPlanId === 'string' &&
    input.dietPlanId.trim().length > 0 &&
    Number.isInteger(input.createdMealCount) &&
    input.createdMealCount > 0
  )
}
