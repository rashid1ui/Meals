'use client'

import { useEffect, useState } from 'react'
import type { DraftFood, DraftMeal, FoodBadge } from '@/lib/diet/diff'
import type { FoodOption } from './DietEditor'
import {
  toCanonicalGrams,
  toDisplayQuantity,
  isWholeDisplayQuantity,
  requiresGramsPerUnit,
  unitLabel,
  type UnitConfig
} from '@/lib/nutrition/units'
import Badge from '@/components/ui/Badge'
import TrackingStatusIcon from '@/components/ui/TrackingStatusIcon'
import { PlusIcon, MinusIcon, CloseIcon, SpinnerIcon, ChevronDownIcon } from '@/components/ui/icons'
import { getFoodEmoji } from '@/lib/food/foodEmojiMap'

const QUANTITY_STEP = 10

const BADGE_VARIANT: Record<FoodBadge, 'success' | 'warning' | 'error' | 'neutral'> = {
  added: 'success',
  increased: 'warning',
  decreased: 'error',
  moved: 'neutral'
}

const BADGE_LABELS: Record<FoodBadge, string> = {
  added: 'Added',
  increased: 'Increased',
  decreased: 'Decreased',
  moved: 'Moved'
}

export type FoodTrackingStatus = 'none' | 'partial' | 'complete'

// This food's live tracking state, sourced from the server (never
// recomputed from the plan) - `consumedQuantity`/`plannedQuantity` are both
// canonical grams/ml, same basis as `food.quantity`.
export type FoodTrackingInfo = {
  status: FoodTrackingStatus
  consumedQuantity: number
  plannedQuantity: number
  actual: { calories: number; protein: number; carbs: number; fat: number }
  onLog: (consumedQuantity: number) => void
  logging: boolean
}

type Props = {
  food: DraftFood
  meal: DraftMeal
  badges: FoodBadge[]
  onRemove: () => void
  // Undefined for a food belonging to a meal that hasn't been saved yet -
  // tracking only ever applies to persisted foods.
  completion?: FoodTrackingInfo
  // The resolved food_database row, for display-unit info. Null/undefined
  // for a "Locked" food with no live match (see the `locked` badge below) -
  // it falls back to plain grams, identical to its existing behavior.
  dbFood?: FoodOption | null
}

// A food row reads as a single scannable LINE ITEM (checkbox, name, unit,
// macros, delete) - never a bordered card-inside-a-card. Logging a partial
// amount eaten stays hidden until the row itself is expanded, so the
// default view is "what did I eat", not "here is a form".
export default function FoodRow({ food, badges, onRemove, completion, dbFood }: Props) {
  const locked = food.foodDatabaseId === null
  const unitConfig: UnitConfig = {
    displayUnit: dbFood?.display_unit || 'g',
    gramsPerDisplayUnit: dbFood?.grams_per_display_unit || 1
  }
  const displayQuantity = toDisplayQuantity(food.quantity, unitConfig)
  const isExact = isWholeDisplayQuantity(food.quantity, unitConfig)
  const isPieceLike = requiresGramsPerUnit(unitConfig.displayUnit)
  const unit = unitLabel(unitConfig.displayUnit, displayQuantity)

  const [editing, setEditing] = useState(false)

  // Steps by one whole display unit for piece-like foods (1 egg, 1 slice),
  // by a finer 100g increment for kg (0.1kg), or the existing 10-unit step
  // for plain g/ml.
  const stepSize = unitConfig.displayUnit === 'kg' ? 0.1 : isPieceLike ? 1 : QUANTITY_STEP

  // How much has actually been eaten so far today - entirely separate from
  // this food's planned quantity in the diet (food.quantity), which is not
  // editable from this row.
  const consumedDisplay = completion ? toDisplayQuantity(completion.consumedQuantity, unitConfig) : 0
  const plannedDisplayForLog = completion ? toDisplayQuantity(completion.plannedQuantity, unitConfig) : 0
  const [logInputValue, setLogInputValue] = useState(String(consumedDisplay))

  // Keeps the "how much did you eat" input in sync with the server-confirmed
  // amount whenever it changes from outside this input (e.g. the quick
  // checkbox toggle, or another tab) - never fires from the user's own
  // keystrokes here, since those don't change completion.consumedQuantity
  // until commitLoggedQuantity's own upstream round-trip completes.
  useEffect(() => {
    if (completion) setLogInputValue(String(consumedDisplay))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion?.consumedQuantity])

  const commitLoggedQuantity = (displayValue: number) => {
    if (!completion || !isFinite(displayValue)) return
    const clamped = Math.max(0, Math.min(displayValue, plannedDisplayForLog))
    setLogInputValue(String(clamped))
    completion.onLog(toCanonicalGrams(clamped, unitConfig))
  }

  const logStep = (delta: number) => {
    if (!completion) return
    const next = Math.max(0, Math.min(consumedDisplay + delta, plannedDisplayForLog))
    commitLoggedQuantity(next)
  }

  // Primary interaction: tap the checkbox to log the FULL planned amount as
  // eaten, or clear it back to not-eaten. Partial amounts are logged via the
  // "How much did you eat?" stepper below (reachable by expanding the row).
  const handleQuickToggle = () => {
    if (!completion) return
    completion.onLog(completion.status === 'complete' ? 0 : completion.plannedQuantity)
  }

  const status = completion?.status ?? 'none'
  const statusLabel = status === 'complete' ? 'Eaten' : status === 'partial' ? 'Partially eaten' : 'Not eaten'
  const nextActionLabel = status === 'complete' ? `Mark ${food.name} as not eaten` : `Mark ${food.name} as eaten`

  return (
    <div className="py-2 border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-2">
        {completion && (
          <button
            type="button"
            role="checkbox"
            aria-checked={status === 'complete' ? true : status === 'partial' ? 'mixed' : false}
            aria-label={nextActionLabel}
            title={statusLabel}
            onClick={handleQuickToggle}
            disabled={completion.logging}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-control transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {completion.logging ? (
              <SpinnerIcon size={16} className="animate-spin" />
            ) : (
              <TrackingStatusIcon status={status} size={24} />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setEditing(e => !e)}
          aria-expanded={editing}
          aria-label={`${editing ? 'Collapse' : 'Edit'} ${food.name}`}
          className="min-w-0 flex-1 flex items-center justify-between gap-2 text-left rounded-control py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                <span aria-hidden="true" className="text-base leading-none shrink-0">
                  {getFoodEmoji(food.name)}
                </span>
                <span className="font-semibold text-foreground truncate">{food.name}</span>
              </span>
              {badges.map(badge => (
                <Badge key={badge} variant={BADGE_VARIANT[badge]}>
                  {BADGE_LABELS[badge]}
                </Badge>
              ))}
              {locked && (
                <Badge
                  variant="neutral"
                  title="This food's original nutrition data couldn't be matched, so its quantity can't be safely recalculated. It can still be moved or removed."
                >
                  Locked
                </Badge>
              )}
              {!isExact && (
                <Badge
                  variant="warning"
                  title={`${displayQuantity} ${unit} is an approximate display of ${Math.round(food.quantity)}g - the exact gram amount is what's actually used for nutrition.`}
                >
                  Approx.
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap font-mono tabular-nums text-xs mt-0.5">
              <span className="font-semibold text-foreground">
                {displayQuantity} {unit}
              </span>
              <span className="text-border">·</span>
              <span className="text-foreground/70">{Math.round(food.calories)} kcal</span>
              <span className="text-protein">{Math.round(food.protein)}P</span>
              <span className="text-carbs">{Math.round(food.carbs)}C</span>
              <span className="text-fat">{Math.round(food.fat)}F</span>
            </div>
            {/* Actual-eaten feedback, visible without expanding - only shown
                once something has actually been logged, so a fully-planned
                but untouched food doesn't show a redundant "0 eaten" line. */}
            {completion && status !== 'none' && (
              <div className="flex items-center gap-1.5 flex-wrap font-mono tabular-nums text-xs mt-1">
                <span className={`font-semibold ${status === 'complete' ? 'text-success' : 'text-warning'}`}>
                  Eaten: {consumedDisplay}/{plannedDisplayForLog} {unit}
                </span>
                <span className="text-border">·</span>
                <span className="text-foreground/70">{Math.round(completion.actual.calories)} kcal</span>
                <span className="text-protein">{Math.round(completion.actual.protein)}P</span>
                <span className="text-carbs">{Math.round(completion.actual.carbs)}C</span>
                <span className="text-fat">{Math.round(completion.actual.fat)}F</span>
              </div>
            )}
          </div>
          <ChevronDownIcon
            size={14}
            className={`shrink-0 text-muted-foreground/50 transition-transform duration-150 ${editing ? 'rotate-180' : ''}`}
          />
        </button>

        <button
          onClick={onRemove}
          aria-label={`Remove ${food.name}`}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-control text-muted-foreground/50 hover:text-error hover:bg-error/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {editing && (
        <div className="mt-2 pl-[52px] space-y-3">
          {completion && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
                How much did you eat?
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => logStep(-stepSize)}
                  disabled={completion.logging}
                  aria-label={`Decrease amount of ${food.name} eaten`}
                  className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-elevated border border-border hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <MinusIcon size={16} />
                </button>
                <input
                  type="number"
                  value={logInputValue}
                  disabled={completion.logging}
                  onChange={e => setLogInputValue(e.target.value)}
                  onBlur={() => commitLoggedQuantity(parseFloat(logInputValue))}
                  aria-label={`Amount of ${food.name} eaten, in ${unit}`}
                  className="w-16 min-h-[44px] text-center bg-surface border border-border rounded-control text-sm font-mono tabular-nums disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <span className="text-sm font-semibold text-foreground">
                  / {plannedDisplayForLog} {unit}
                </span>
                <button
                  onClick={() => logStep(stepSize)}
                  disabled={completion.logging}
                  aria-label={`Increase amount of ${food.name} eaten`}
                  className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-elevated border border-border hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <PlusIcon size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
