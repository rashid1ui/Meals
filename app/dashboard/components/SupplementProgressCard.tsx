'use client'

// Dashboard's top-level daily supplement completion card - rendered inside
// DailyProgress, next to Protein/Carbs/Fat (spec section 9). Deliberately
// its own tile, never folded into the macro totals (section 10: supplement
// doses are not a nutritional macro) - one authoritative percentage, read
// from the same SupplementsTrackingProvider the Supplements list itself
// uses, so marking a dose taken there updates this card immediately with no
// reload (section 9) and no second, competing calculation (section 11).

import Card from '@/components/ui/Card'
import { useSupplementsTracking } from '@/lib/supplements/SupplementsTrackingProvider'

export default function SupplementProgressCard() {
  const { summary } = useSupplementsTracking()

  // No supplements scheduled today (none added yet, or none active in this
  // date range) - nothing meaningful to show here; the Supplements section
  // further down still renders its own empty state.
  if (!summary || summary.total === 0) return null

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplements</span>
        <span className="font-mono tabular-nums text-xs font-bold text-muted-foreground">{summary.percentage}%</span>
      </div>
      <div className="font-mono tabular-nums text-xl font-bold text-foreground">
        {summary.completed}
        <span className="text-muted-foreground text-sm font-normal">/{summary.total} taken</span>
      </div>
      <div
        role="progressbar"
        aria-label="Supplement doses taken today"
        aria-valuenow={summary.completed}
        aria-valuemin={0}
        aria-valuemax={summary.total}
        className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${summary.percentage}%` }}
        />
      </div>
    </Card>
  )
}
