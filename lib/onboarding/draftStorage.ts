// Single source of truth for the onboarding wizard's local-device draft key
// (app/onboarding/OnboardingForm.tsx persists in-progress answers here so a
// refresh/closed tab doesn't lose them). Extracted to its own tiny,
// React-free module so any other client code that needs to clear it -
// currently app/settings/ResetAccountButton.tsx - never hardcodes the string
// a second time and risks drifting out of sync with it.
export const ONBOARDING_DRAFT_STORAGE_KEY = 'gym-meals-onboarding-draft-v1'

// Removes only the LOCAL (this browser) draft. The account-scoped server
// copy (public.onboarding_drafts) is a separate concern, cleared via
// app/onboarding/draft-actions.ts's clearServerOnboardingDraft() or, for a
// full account reset, directly by app/settings/actions.ts's resetAccount().
// Both sides must be cleared together - see ResetAccountButton.tsx - or
// whichever one is missed repopulates the other the next time the
// onboarding wizard mounts and reconciles the two copies.
export function clearLocalOnboardingDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY)
  } catch {
    // Storage unavailable (private browsing, quota) - nothing to clean up.
  }
}
