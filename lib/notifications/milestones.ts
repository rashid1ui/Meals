// Pure, framework-free milestone-crossing logic - no Supabase, no
// 'use client'/'use server'. Takes an already-computed percentage (from
// lib/tracking/logic.ts's pctOf - this module never computes it itself, so
// there is exactly one nutrition-percentage calculation in the app) and
// decides which milestones are newly reached. Mirrors schedule.ts's split
// with lib/notifications/actions.ts.

export const MILESTONE_THRESHOLDS = [25, 50, 75, 90, 100] as const
export type MilestoneThreshold = (typeof MILESTONE_THRESHOLDS)[number]

export function buildMilestoneEventKey(threshold: MilestoneThreshold): string {
  return `milestone:${threshold}`
}

// Every threshold at or below the current percentage that hasn't already
// been claimed today, ascending. A caller that jumps several thresholds at
// once (e.g. logging a large meal takes progress from 10% to 100% in one
// step) gets all of them back here so it can mark every one claimed (so none
// of the skipped-over lower thresholds can fire later after an edit/undo),
// while still choosing to notify about only the highest one reached - see
// useMealReminders.ts.
export function thresholdsToClaim(currentPct: number, alreadyClaimed: readonly number[]): MilestoneThreshold[] {
  const claimed = new Set(alreadyClaimed)
  return MILESTONE_THRESHOLDS.filter(t => t <= currentPct && !claimed.has(t))
}
