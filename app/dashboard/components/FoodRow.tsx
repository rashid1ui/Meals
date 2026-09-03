'use client'

import { useState } from 'react'
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
import { isValidQuantity } from '@/lib/nutrition/calculator'
import Badge from '@/components/ui/Badge'
import TrackingStatusIcon from '@/components/ui/TrackingStatusIcon'
import { PlusIcon, MinusIcon, CloseIcon, ChevronDownIcon } from '@/components/ui/icons'
import { getFoodEmoji } from '@/lib/food/foodEmojiMap'
import { formatMealName } from '@/lib/nutrition/workoutMeals'

const QUANTITY_STEP = 10

// The user owns their plan once it's generated: freely editing a planned
// quantity is normal, expected use, not a deviation from a fixed AI target -
// so only structural facts ('added'/'moved') get a badge here. 'increased'/
// 'decreased' are deliberately excluded from per-food display (they'd read
// as a warning that something is wrong); ChangeSummaryPanel still lists them
// in the neutral, informational unsaved-changes summary.
type DisplayBadge = Extract<FoodBadge, 'added' | 'moved'>

const BADGE_VARIANT: Record<DisplayBadge, 'success' | 'warning' | 'error' | 'neutral'> = {
  added: 'success',
  moved: 'neutral'
}

const BADGE_LABELS: Record<DisplayBadge, string> = {
  added: 'Added',
  moved: 'Moved'
}

function isDisplayBadge(badge: FoodBadge): badge is DisplayBadge {
  return badge === 'added' || badge === 'moved'
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
  // Fired when the user edits the planned quantity of this food. Missing
  // for a "Locked" food, since its macros cannot be recomputed.
  onUpdateQuantity?: (newCanonicalGrams: number) => void
  // Fired with the target meal id when the user moves this food elsewhere.
  // Available even for a "Locked" food - moving doesn't touch its macros.
  onMove?: (targetMealId: string) => void
  // Every other meal in the current draft, offered as move destinations.
  otherMeals?: { id: string; name: string }[]
}

// A food row reads as a single scannable LINE ITEM (checkbox, name, unit,
// macros, delete) - never a bordered card-inside-a-card. Logging a partial
// amount eaten stays hidden until the row itself is expanded, so the
// default view is "what did I eat", not "here is a form".
export default function FoodRow({ food, badges, onRemove, completion, dbFood, onUpdateQuantity, onMove, otherMeals }: Props) {
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

  // Local state for the planned quantity editor
  const [plannedInputValue, setPlannedInputValue] = useState(String(displayQuantity))

  // Keeps the "how much did you eat" input in sync with the server-confirmed
  // amount whenever it changes from outside this input (e.g. the quick
  // checkbox toggle, or another tab) - never fires from the user's own
  // keystrokes here, since those don't change completion.consumedQuantity
  // until commitLoggedQuantity's own upstream round-trip completes.
  //
  // Adjusted during render (React's documented pattern for "reset state
  // when a prop changes" - react.dev/learn/you-might-not-need-an-effect)
  // instead of in a useEffect, so this doesn't cost an extra post-paint
  // render pass. Same trigger condition as before: only reacts to a genuine
  // change in completion.consumedQuantity, not to unitConfig/consumedDisplay
  // incidentally changing.
  const [prevConsumedQuantity, setPrevConsumedQuantity] = useState(completion?.consumedQuantity)
  if (completion && completion.consumedQuantity !== prevConsumedQuantity) {
    setPrevConsumedQuantity(completion.consumedQuantity)
    setLogInputValue(String(consumedDisplay))
  }

  // Sync planned input value if the underlying food quantity changes
  // externally (e.g. undo/redo) - same render-time adjustment pattern as above.
  const [prevDisplayQuantity, setPrevDisplayQuantity] = useState(displayQuantity)
  if (displayQuantity !== prevDisplayQuantity) {
    setPrevDisplayQuantity(displayQuantity)
    setPlannedInputValue(String(displayQuantity))
  }

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

  const [plannedQuantityError, setPlannedQuantityError] = useState<string | null>(null)

  const commitPlannedQuantity = (displayValue: number) => {
    if (!onUpdateQuantity || !isFinite(displayValue) || displayValue <= 0) {
      setPlannedInputValue(String(displayQuantity)) // revert on invalid
      setPlannedQuantityError(null)
      return
    }
    // Same bound the server enforces (lib/nutrition/calculator.ts's
    // isValidQuantity, via lib/diet/save-plan.ts's resolveMeal) - grams and
    // ml share the identical 1000 cap there, and every editable food's
    // canonical unit is always one of those two, so 'grams' is a safe,
    // always-correct stand-in without needing this row's own food_database
    // serving_unit. Checked here so an out-of-range edit is caught the
    // moment it's made, not only much later at Save.
    const canonical = toCanonicalGrams(displayValue, unitConfig)
    if (!isValidQuantity(canonical, 'grams')) {
      setPlannedInputValue(String(displayValue))
      setPlannedQuantityError('That quantity is outside the allowed range. Please enter a smaller amount.')
      return
    }
    setPlannedQuantityError(null)
    setPlannedInputValue(String(displayValue))
    onUpdateQuantity(canonical)
  }

  const plannedStep = (delta: number) => {
    const next = Math.max(stepSize, displayQuantity + delta)
    commitPlannedQuantity(next)
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
            aria-busy={completion.logging}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-control transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* The checkmark updates instantly from the optimistic state; a
                background save shows only as a subtle pulse, never a spinner
                that hides the result or a disabled control that blocks the
                next click. */}
            <span className={completion.logging ? 'animate-pulse' : undefined}>
              <TrackingStatusIcon status={status} size={24} />
            </span>
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
              {badges.filter(isDisplayBadge).map(badge => (
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
                  aria-label={`Decrease amount of ${food.name} eaten`}
                  className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-elevated border border-border hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <MinusIcon size={16} />
                </button>
                <input
                  type="number"
                  value={logInputValue}
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
                  aria-label={`Increase amount of ${food.name} eaten`}
                  className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-elevated border border-border hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <PlusIcon size={16} />
                </button>
              </div>
            </div>
          )}

          {onUpdateQuantity && (
            <div className={`space-y-1.5 ${completion ? 'pt-4 border-t border-border/60' : ''}`}>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
                Planned Amount
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => plannedStep(-stepSize)}
                    aria-label={`Decrease planned amount of ${food.name}`}
                    className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-elevated border border-border hover:bg-border text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <MinusIcon size={16} />
                  </button>
                  <input
                    type="number"
                    value={plannedInputValue}
                    onChange={e => setPlannedInputValue(e.target.value)}
                    onBlur={() => commitPlannedQuantity(parseFloat(plannedInputValue))}
                    aria-label={`Planned amount of ${food.name}, in ${unit}`}
                    className="w-20 min-h-[44px] text-center bg-surface border border-border rounded-control text-sm font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <button
                    onClick={() => plannedStep(stepSize)}
                    aria-label={`Increase planned amount of ${food.name}`}
                    className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-elevated border border-border hover:bg-border text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <PlusIcon size={16} />
                  </button>
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {unit}
                </span>
              </div>
              {plannedQuantityError && (
                <p className="text-xs text-error" role="alert">
                  {plannedQuantityError}
                </p>
              )}
            </div>
          )}

          {onMove && otherMeals && otherMeals.length > 0 && (
            <div className={`space-y-1.5 ${completion || onUpdateQuantity ? 'pt-4 border-t border-border/60' : ''}`}>
              <label htmlFor={`move-${food.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
                Move to
              </label>
              <select
                id={`move-${food.id}`}
                value=""
                onChange={e => {
                  const targetMealId = e.target.value
                  if (targetMealId) onMove(targetMealId)
                }}
                aria-label={`Move ${food.name} to another meal`}
                className="w-full min-h-[44px] px-3 bg-surface border border-border rounded-control text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="" disabled>Choose a meal&hellip;</option>
                {otherMeals.map(m => (
                  <option key={m.id} value={m.id}>{formatMealName(m.name)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
