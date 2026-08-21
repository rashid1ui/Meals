'use client'

import { pctOf } from '@/lib/tracking/logic'
import type { DailyTrackingSummary } from '../tracking-actions'
import Card from '@/components/ui/Card'

type Props = {
  tracking: DailyTrackingSummary
}

type StatProps = {
  label: string
  fraction: string
  pct: number
  barClass: string
}

function Stat({ label, fraction, pct, barClass }: StatProps) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </span>
        <span className="font-mono tabular-nums text-xs font-bold text-foreground shrink-0">{fraction}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

// Section 2 - a compact, glanceable strip answering "how is today going?" in
// 2-3 seconds: meal/food completion counts plus the same four macro
// percentages already shown in full above, condensed to bars only. Pure UI
// aggregation of DailyTrackingSummary (already fetched by DietEditor) - no
// new nutrition math, nothing here is computed outside what tracking-actions
// already returns.
export default function DailyProgressSummary({ tracking }: Props) {
  const totalMeals = tracking.meals.length
  const completedMeals = tracking.meals.filter(m => m.status === 'complete').length
  const totalFoods = tracking.meals.reduce((sum, m) => sum + m.foods.length, 0)
  const completedFoods = tracking.meals.reduce(
    (sum, m) => sum + m.foods.filter(f => f.completed).length,
    0
  )

  if (totalMeals === 0) return null

  return (
    <Card className="p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Today&apos;s Progress
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-4">
        <Stat
          label="Meals"
          fraction={`${completedMeals}/${totalMeals}`}
          pct={totalMeals > 0 ? (completedMeals / totalMeals) * 100 : 0}
          barClass="bg-primary"
        />
        <Stat
          label="Foods"
          fraction={`${completedFoods}/${totalFoods}`}
          pct={totalFoods > 0 ? (completedFoods / totalFoods) * 100 : 0}
          barClass="bg-primary"
        />
        <Stat
          label="Calories"
          fraction={`${Math.round(pctOf(tracking.consumed.calories, tracking.target.calories))}%`}
          pct={pctOf(tracking.consumed.calories, tracking.target.calories)}
          barClass="bg-calories"
        />
        <Stat
          label="Protein"
          fraction={`${Math.round(pctOf(tracking.consumed.protein, tracking.target.protein))}%`}
          pct={pctOf(tracking.consumed.protein, tracking.target.protein)}
          barClass="bg-protein"
        />
        <Stat
          label="Carbs"
          fraction={`${Math.round(pctOf(tracking.consumed.carbs, tracking.target.carbs))}%`}
          pct={pctOf(tracking.consumed.carbs, tracking.target.carbs)}
          barClass="bg-carbs"
        />
        <Stat
          label="Fat"
          fraction={`${Math.round(pctOf(tracking.consumed.fat, tracking.target.fat))}%`}
          pct={pctOf(tracking.consumed.fat, tracking.target.fat)}
          barClass="bg-fat"
        />
      </div>
    </Card>
  )
}
