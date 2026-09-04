'use client'

import type { ComponentType } from 'react'
import { classifyTarget, type MacroTotals, type TargetStatus } from '@/lib/diet/diff'
import type { DailyTrackingSummary } from '../tracking-actions'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import ProgressRing from '@/components/ui/ProgressRing'
import {
  DumbbellIcon,
  WheatIcon,
  DropletIcon,
  UtensilsIcon,
  AppleIcon,
  TrendingUpIcon,
  type IconProps
} from '@/components/ui/icons'

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

// Quiet foot-note colour for a macro's "X g left / over" line - green when
// on target, amber when drifting, red when well past. Never the ONLY signal:
// the text itself ("left" vs "over") always says which way.
const STATUS_TEXT_CLASS: Record<TargetStatus, string> = {
  'on-target': 'text-success',
  'slightly-over': 'text-warning',
  'slightly-under': 'text-warning',
  'over': 'text-error',
  'under': 'text-error'
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

type CalorieCardProps = { current: number; target: number }

// LEVEL 1 - the single dominant element. Answers "what have I eaten / how
// much is left / am I on track?" in one glance: a real completion ring
// (uncapped % in the centre, arc clamped at one turn), the raw numbers, a
// capped bar, and the target-status badge. Every value is derived from
// tracking.consumed vs tracking.target - never the planned diet total.
function CalorieCard({ current, target }: CalorieCardProps) {
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
    <Card elevated className="p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s Calorie Progress
        </h3>
        <Badge
          variant={STATUS_BADGE_VARIANT[status]}
          className="shrink-0 self-start whitespace-nowrap"
        >
          {STATUS_LABELS[status]}
        </Badge>
      </div>

      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-7">
        <div className="flex shrink-0 flex-col items-center gap-1.5 self-center sm:self-auto">
          <ProgressRing
            value={rawPct(current, target)}
            label={`${pct}% of your daily calorie target consumed`}
            size={128}
            strokeWidth={11}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            of target
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono tabular-nums text-4xl sm:text-5xl font-bold text-calories">
              {Math.round(current)}
            </span>
            <span className="text-base text-muted-foreground">/ {Math.round(target)} kcal</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{pct}% of target consumed</p>

          <div
            role="progressbar"
            aria-label="Calories actually consumed toward daily target"
            aria-valuenow={Math.round(current)}
            aria-valuemin={0}
            aria-valuemax={Math.round(target)}
            className="mt-3 h-2.5 rounded-full bg-surface-elevated border border-border overflow-hidden"
          >
            <div
              className="h-full rounded-full bg-calories transition-[width] duration-300"
              style={{ width: `${progressPct(current, target)}%` }}
            />
          </div>
        </div>

        <div className="flex items-start gap-2 border-t border-border pt-4 sm:w-44 sm:shrink-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <TrendingUpIcon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Stay consistent</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{remainingLabel}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}

type MacroCardProps = {
  label: string
  value: number
  target: number
  unit: string
  valueClass: string
  barClass: string
  icon: ComponentType<IconProps>
}

// LEVEL 2 - three compact, equally-weighted cards. Same consumed-vs-target
// maths as the calorie card (rawPct for the % text, progressPct for the
// capped bar). Colour + icon aid recognition; the "left / over" wording
// carries the meaning without them.
function MacroCard({ label, value, target, unit, valueClass, barClass, icon: Icon }: MacroCardProps) {
  const { status } = classifyTarget(value, target)
  const pct = Math.round(rawPct(value, target))
  const remaining = target - value
  const remainingLabel =
    remaining >= 0
      ? `${Math.round(remaining)}${unit} left`
      : `${Math.round(Math.abs(remaining))}${unit} over`

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Icon size={14} className={`shrink-0 ${valueClass}`} aria-hidden="true" />
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </span>
        <span className="font-mono tabular-nums text-xs font-bold text-muted-foreground">{pct}%</span>
      </div>

      <div className="mt-2 font-mono tabular-nums">
        <span className={`text-xl font-bold ${valueClass}`}>{Math.round(value)}</span>
        <span className="text-sm text-muted-foreground">
          {' '}/ {Math.round(target)}
          {unit}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`${label} actually consumed toward daily target`}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        className="mt-2 h-1.5 rounded-full bg-surface-elevated border border-border overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barClass}`}
          style={{ width: `${progressPct(value, target)}%` }}
        />
      </div>

      <div className={`mt-1.5 text-[11px] font-semibold ${STATUS_TEXT_CLASS[status]}`}>
        {remainingLabel}
      </div>
    </Card>
  )
}

type StatCardProps = {
  label: string
  done: number
  total: number
  icon: ComponentType<IconProps>
}

// LEVEL 4 - the only numbers on this section that aren't already shown
// above. Presentational summary, not a link: no chevron, nothing to click.
function StatCard({ label, done, total, icon: Icon }: StatCardProps) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-chip bg-surface-elevated border border-border">
        <Icon size={18} className="text-primary" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="font-mono tabular-nums text-lg font-bold text-foreground">
          {done}
          <span className="text-sm font-normal text-muted-foreground"> / {total}</span>
        </div>
        <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
      </div>
    </Card>
  )
}

type Props = {
  tracking: DailyTrackingSummary
}

// The ONE daily progress section (replaces the old Today's Nutrition hero +
// macro cards + separate Today's Progress card, which duplicated the exact
// same calorie/protein/carb/fat percentages twice). Everything here reads
// from tracking.consumed - actually-logged consumption - never the planned
// diet total. The meals/foods completion counts at the bottom are the only
// information that ISN'T already shown above, so they're kept as a compact
// pair of cards rather than a second full section.
//
// Supplement dose tracking is a SEPARATE workstream with its own full UI
// (SupplementsSection, mounted on the dashboard + settings pages); this
// nutrition summary deliberately stays scoped to calories, macros, and
// meal/food completion and does not restate a supplement count here.
export default function DailyProgress({ tracking }: Props) {
  const totals: MacroTotals = tracking.consumed
  // ONE target source: the same effectiveDailyTarget the server already
  // computed for this day (tracking.target). Previously this took a separate
  // `targets` prop derived from a second, independently-fetched copy of the
  // plan on the page - identical in practice but a latent divergence point.
  const targets = tracking.target
  const totalMeals = tracking.meals.length
  const completedMeals = tracking.meals.filter(m => m.status === 'complete').length
  const totalFoods = tracking.meals.reduce((sum, m) => sum + m.foods.length, 0)
  const completedFoods = tracking.meals.reduce(
    (sum, m) => sum + m.foods.filter(f => f.status === 'complete').length,
    0
  )

  return (
    <div className="space-y-4">
      <CalorieCard current={totals.calories} target={targets.calories} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MacroCard
          label="Protein"
          value={totals.protein}
          target={targets.protein}
          unit="g"
          valueClass="text-protein"
          barClass="bg-protein"
          icon={DumbbellIcon}
        />
        <MacroCard
          label="Carbs"
          value={totals.carbs}
          target={targets.carbs}
          unit="g"
          valueClass="text-carbs"
          barClass="bg-carbs"
          icon={WheatIcon}
        />
        <MacroCard
          label="Fat"
          value={totals.fat}
          target={targets.fat}
          unit="g"
          valueClass="text-fat"
          barClass="bg-fat"
          icon={DropletIcon}
        />
      </div>

      {totalMeals > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Meals eaten" done={completedMeals} total={totalMeals} icon={UtensilsIcon} />
          <StatCard label="Foods eaten" done={completedFoods} total={totalFoods} icon={AppleIcon} />
        </div>
      )}
    </div>
  )
}
