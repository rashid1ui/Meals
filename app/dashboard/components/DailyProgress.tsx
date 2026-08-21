'use client'

import { classifyTarget, type MacroTotals, type TargetStatus } from '@/lib/diet/diff'
import type { DailyTrackingSummary } from '../tracking-actions'
import type { Targets } from './DietEditor'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

const STATUS_LABELS: Record<TargetStatus, string> = {
  'on-target': 'On Target',
  'slightly-over': 'Slightly Over',
  'slightly-under': 'Slightly Under',
  'over': 'Over Target',
  'under': 'Below Target'
}

const STATUS_BADGE_VARIANT: Record<TargetStatus, 'success' | 'warning' | 'error'> = {
  'on-target': 'success',
  'slightly-over': 'warning',
  'slightly-under': 'warning',
  'over': 'error',
  'under': 'error'
}

function progressPct(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.max(0, (value / target) * 100))
}

// Raw (uncapped) percentage for display text - "134% of daily target" is
// meaningful information the capped progress-bar width deliberately hides.
function rawPct(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, (value / target) * 100)
}

type HeroProps = { current: number; target: number }

function CalorieHero({ current, target }: HeroProps) {
  const { status } = classifyTarget(current, target)
  const diff = target - current
  const pct = Math.round(rawPct(current, target))
  // Both "remaining" and "over" are plain subtraction from data already on
  // screen (current vs target) - nothing here is estimated or invented.
  const remainingLabel =
    diff >= 0
      ? `${Math.round(diff)} kcal remaining`
      : `${Math.round(Math.abs(diff))} kcal over target`

  return (
    <Card elevated className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s Actual Progress
        </span>
        <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
      </div>

      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono tabular-nums text-4xl sm:text-5xl font-bold text-calories">
            {Math.round(current)}
          </span>
          <span className="text-muted-foreground">/ {Math.round(target)} kcal</span>
        </div>
        <p className="text-sm font-semibold text-muted-foreground mt-1">{pct}% of daily target consumed</p>
      </div>

      <div
        role="progressbar"
        aria-label="Calories actually consumed toward daily target"
        aria-valuenow={Math.round(current)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        className="h-2.5 rounded-full bg-surface-elevated border border-border overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-calories transition-[width] duration-300"
          style={{ width: `${progressPct(current, target)}%` }}
        />
      </div>

      <p className="text-sm text-muted-foreground">{remainingLabel}</p>
    </Card>
  )
}

type TileProps = {
  label: string
  value: number
  target: number
  unit: string
  valueClass: string
  barClass: string
}

function MacroTile({ label, value, target, unit, valueClass, barClass }: TileProps) {
  const { status } = classifyTarget(value, target)
  const pct = Math.round(rawPct(value, target))
  const remaining = target - value
  const remainingLabel =
    remaining >= 0 ? `${Math.round(remaining)}${unit} left` : `${Math.round(Math.abs(remaining))}${unit} over`

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-mono tabular-nums text-xs font-bold text-muted-foreground">{pct}%</span>
      </div>
      <div className={`font-mono tabular-nums text-xl font-bold ${valueClass}`}>
        {Math.round(value)}
        <span className="text-muted-foreground text-sm font-normal">
          /{Math.round(target)}
          {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} actually consumed toward daily target`}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barClass}`}
          style={{ width: `${progressPct(value, target)}%` }}
        />
      </div>
      <div
        className={`text-[11px] font-semibold ${
          status === 'on-target'
            ? 'text-success'
            : status === 'slightly-over' || status === 'slightly-under'
              ? 'text-warning'
              : 'text-error'
        }`}
      >
        {remainingLabel}
      </div>
    </Card>
  )
}

type Props = {
  tracking: DailyTrackingSummary
  targets: Targets
}

// The ONE daily progress section (replaces the old Today's Nutrition hero +
// macro cards + separate Today's Progress card, which duplicated the exact
// same calorie/protein/carb/fat percentages twice). Everything here reads
// from tracking.consumed - actually-logged consumption - never the planned
// diet total. The meals/foods completion counts at the bottom are the only
// information that ISN'T already shown above, so they're kept as a compact
// strip rather than a second full section.
export default function DailyProgress({ tracking, targets }: Props) {
  const totals: MacroTotals = tracking.consumed
  const totalMeals = tracking.meals.length
  const completedMeals = tracking.meals.filter(m => m.status === 'complete').length
  const totalFoods = tracking.meals.reduce((sum, m) => sum + m.foods.length, 0)
  const completedFoods = tracking.meals.reduce(
    (sum, m) => sum + m.foods.filter(f => f.status === 'complete').length,
    0
  )

  return (
    <div className="space-y-4">
      <CalorieHero current={totals.calories} target={targets.calories} />

      <div className="grid grid-cols-3 gap-3">
        <MacroTile
          label="Protein"
          value={totals.protein}
          target={targets.protein}
          unit="g"
          valueClass="text-protein"
          barClass="bg-protein"
        />
        <MacroTile
          label="Carbs"
          value={totals.carbs}
          target={targets.carbs}
          unit="g"
          valueClass="text-carbs"
          barClass="bg-carbs"
        />
        <MacroTile
          label="Fat"
          value={totals.fat}
          target={targets.fat}
          unit="g"
          valueClass="text-fat"
          barClass="bg-fat"
        />
      </div>

      {totalMeals > 0 && (
        <div className="flex items-center justify-center gap-8 text-sm font-mono tabular-nums text-muted-foreground">
          <span>
            <span className="font-bold text-foreground">{completedMeals}/{totalMeals}</span> meals eaten
          </span>
          <span>
            <span className="font-bold text-foreground">{completedFoods}/{totalFoods}</span> foods eaten
          </span>
        </div>
      )}
    </div>
  )
}
