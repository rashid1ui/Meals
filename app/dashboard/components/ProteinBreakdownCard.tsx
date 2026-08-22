'use client'

// Dashboard "Protein Breakdown" card (spec sections 5-6). Purely a display
// layer over data DailyProgress/DietEditor already fetch - reads
// tracking.proteinBreakdown (app/dashboard/tracking-actions.ts) and
// targets.protein (the existing diet_plans.protein_target), same "actually
// consumed vs target" convention as DailyProgress. Adds no new tracking
// logic of its own.

import { RECOMMENDED_ANIMAL_PROTEIN_PCT, RECOMMENDED_PLANT_PROTEIN_PCT, type ProteinBreakdown } from '@/lib/nutrition/proteinType'
import Card from '@/components/ui/Card'

type Props = {
  breakdown: ProteinBreakdown
  target: number
}

type RowConfig = {
  key: keyof ProteinBreakdown
  label: string
  barClass: string
}

const ROWS: RowConfig[] = [
  { key: 'animal', label: 'Animal Protein', barClass: 'bg-protein' },
  { key: 'plant', label: 'Plant Protein', barClass: 'bg-protein/60' },
  { key: 'supplement', label: 'Supplement Protein', barClass: 'bg-protein/35' }
]

function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

export default function ProteinBreakdownCard({ breakdown, target }: Props) {
  const total = breakdown.animal + breakdown.plant + breakdown.supplement
  const targetPct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0
  const animalSharePct = pct(breakdown.animal, total)
  const plantSharePct = pct(breakdown.plant, total)

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-display text-lg font-bold text-foreground">Protein Breakdown</h3>
        <span className="text-xs font-semibold text-muted-foreground">
          Daily Target: <span className="font-mono tabular-nums text-foreground">{Math.round(target)}g</span>
        </span>
      </div>

      <div className="space-y-3">
        {ROWS.map(row => {
          const value = breakdown[row.key]
          return (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-foreground">{row.label}</span>
                <span className="font-mono tabular-nums font-semibold text-protein">{Math.round(value)}g</span>
              </div>
              <div
                role="progressbar"
                aria-label={`${row.label} toward total protein consumed today`}
                aria-valuenow={Math.round(value)}
                aria-valuemin={0}
                aria-valuemax={Math.round(target)}
                className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${row.barClass}`}
                  style={{ width: `${target > 0 ? Math.min(100, (value / target) * 100) : 0}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">Total Protein</span>
        <span className="font-mono tabular-nums text-lg font-bold text-protein">
          {Math.round(total)}
          <span className="text-muted-foreground text-sm font-normal">/{Math.round(target)}g</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{targetPct}% of daily target consumed</p>

      {/* Recommendation only - never a restriction (spec section 6). */}
      <div className="pt-3 border-t border-border space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recommended ratio for gym users
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Animal {RECOMMENDED_ANIMAL_PROTEIN_PCT[0]}-{RECOMMENDED_ANIMAL_PROTEIN_PCT[1]}%
          </span>
          <span>
            Plant {RECOMMENDED_PLANT_PROTEIN_PCT[0]}-{RECOMMENDED_PLANT_PROTEIN_PCT[1]}%
          </span>
        </div>
        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            Today: <span className="font-mono tabular-nums text-foreground">{animalSharePct}%</span> animal ·{' '}
            <span className="font-mono tabular-nums text-foreground">{plantSharePct}%</span> plant
          </p>
        )}
      </div>
    </Card>
  )
}
