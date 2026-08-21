'use client'

import { classifyTarget, type MacroTotals, type TargetStatus } from '@/lib/diet/diff'
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

type HeroProps = { current: number; target: number }

function CalorieHero({ current, target }: HeroProps) {
  const { status } = classifyTarget(current, target)
  const diff = target - current
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
          Today&apos;s Calories
        </span>
        <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono tabular-nums text-4xl font-bold text-calories">
          {Math.round(current)}
        </span>
        <span className="text-muted-foreground">kcal of {Math.round(target)}</span>
      </div>

      <div className="h-2 rounded-full bg-surface-elevated border border-border overflow-hidden">
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
  return (
    <Card className="p-4 space-y-2.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className={`font-mono tabular-nums text-xl font-bold ${valueClass}`}>
        {Math.round(value)}
        <span className="text-muted-foreground text-sm font-normal">
          /{Math.round(target)}
          {unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden">
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
        {STATUS_LABELS[status]}
      </div>
    </Card>
  )
}

type Props = {
  totals: MacroTotals
  targets: Targets
}

export default function MacroSummaryCards({ totals, targets }: Props) {
  return (
    <div className="space-y-4">
      <CalorieHero current={totals.calories} target={targets.calories} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MacroTile
          label="Calories"
          value={totals.calories}
          target={targets.calories}
          unit=""
          valueClass="text-calories"
          barClass="bg-calories"
        />
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
    </div>
  )
}
