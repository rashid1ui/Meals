// Pure notification copy generation - no Supabase, no 'use client'/'use
// server', no AI/LLM calls. All copy is a deterministic template: per the
// project spec, calculations/percentages/timing/dedup must stay deterministic
// and AI (if ever introduced) is reserved for personalizing this text, never
// for producing the numbers that feed it. Keeping copy generation in its own
// pure function (rather than inline in the hook) is what would let a future
// personalization layer wrap buildMealReminderCopy/buildMilestoneCopy without
// touching scheduling, milestone, or dedup logic.

import type { MilestoneThreshold } from './milestones'

export interface NotificationCopy {
  title: string
  body: string
}

const EMOJI_RULES: { pattern: RegExp; emoji: string }[] = [
  { pattern: /breakfast/i, emoji: '🍳' },
  { pattern: /lunch/i, emoji: '🍗' },
  { pattern: /dinner/i, emoji: '🍽️' },
  { pattern: /snack/i, emoji: '🥜' },
  { pattern: /pre-?workout/i, emoji: '⚡' },
  { pattern: /post-?workout/i, emoji: '💪' }
]
const DEFAULT_MEAL_EMOJI = '🍽️'

export function mealEmoji(mealName: string): string {
  return EMOJI_RULES.find(r => r.pattern.test(mealName))?.emoji ?? DEFAULT_MEAL_EMOJI
}

export interface ProjectedProgress {
  consumedPct: number
  projectedPct: number
}

// Today's remaining macros - only calories/protein (spec section 7's
// example) rather than all four, to keep a push notification body short.
export interface RemainingNutrition {
  proteinGrams: number
  calories: number
}

// Pure subtraction, clamped at zero - "remaining" can never go negative
// (overeating a target isn't "-40g protein remaining", it's simply done).
// The only place this number is computed; callers (lib/notifications/admin.ts)
// pass in real consumed/target values, never estimate the remainder
// themselves.
export function computeRemainingNutrition(
  consumed: { calories: number; protein: number },
  target: { calories: number; protein: number }
): RemainingNutrition {
  return {
    proteinGrams: Math.max(0, target.protein - consumed.protein),
    calories: Math.max(0, target.calories - consumed.calories)
  }
}

// Never invents numbers: `projected`/`remaining` (when present) must already
// be computed by the caller from real tracking data (see
// useMealReminders.ts and lib/notifications/admin.ts), never estimated here.
// Positive, neutral coaching language only - no "behind"/"missed"/"failed"
// phrasing, per spec section 5. `remaining` takes precedence over
// `projected` when both are given (Phase 2's cron dispatcher passes
// `remaining`; Phase 1's client hook still only ever passes `projected`, so
// existing call sites are unaffected).
export function buildMealReminderCopy(
  mealName: string,
  projected?: ProjectedProgress,
  remaining?: RemainingNutrition
): NotificationCopy {
  const emoji = mealEmoji(mealName)
  let body = `It's time for ${mealName}. Log what you eat and keep your progress moving.`
  if (remaining && (remaining.calories > 0 || remaining.proteinGrams > 0)) {
    const parts: string[] = []
    if (remaining.proteinGrams > 0) parts.push(`${Math.round(remaining.proteinGrams)}g protein`)
    if (remaining.calories > 0) parts.push(`${Math.round(remaining.calories)} calories`)
    body = `Almost there. You still need: ${parts.join(', ')}.`
  } else if (projected) {
    body = `You're at ${Math.round(projected.consumedPct)}% today. Log this meal and you'll be around ${Math.round(projected.projectedPct)}% of your target.`
  }
  return { title: `${mealName} time ${emoji}`, body }
}

const MILESTONE_COPY: Record<MilestoneThreshold, NotificationCopy> = {
  25: { title: 'Great start 🙌', body: "You've hit 25% of today's calorie target. Keep it up." },
  50: { title: "You're halfway there 💪", body: "You've reached 50% of today's calorie target. Keep going." },
  75: { title: '75% complete 🔥', body: "You're at 75% of today's target. One more strong push." },
  90: { title: 'Almost there 🎯', body: "You've reached 90% of today's target. Finish strong." },
  100: { title: 'Daily target complete 🎯', body: 'You reached today\'s target. Great job staying consistent.' }
}

export function buildMilestoneCopy(threshold: MilestoneThreshold): NotificationCopy {
  return MILESTONE_COPY[threshold]
}
