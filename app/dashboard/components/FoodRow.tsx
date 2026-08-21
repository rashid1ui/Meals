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
import Badge from '@/components/ui/Badge'
import { PlusIcon, MinusIcon, CloseIcon, CheckIcon, CircleIcon, SpinnerIcon, ChevronDownIcon } from '@/components/ui/icons'

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

export type FoodCompletionToggle = {
  completed: boolean
  onToggle: () => void
  toggling: boolean
}

type Props = {
  food: DraftFood
  meal: DraftMeal
  otherMeals: DraftMeal[]
  badges: FoodBadge[]
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
  onMove: (toMealId: string) => void
  // Undefined for a food belonging to a meal that hasn't been saved yet -
  // tracking only ever applies to persisted foods.
  completion?: FoodCompletionToggle
  // The resolved food_database row, for display-unit info. Null/undefined
  // for a "Locked" food with no live match (see the `locked` badge below) -
  // it falls back to plain grams, identical to its existing behavior.
  dbFood?: FoodOption | null
}

// A food row reads as a single scannable LINE ITEM (checkbox, name, unit,
// macros, delete) - never a bordered card-inside-a-card. The bulkiest
// controls (quantity stepper, Move-to) stay hidden until the row itself is
// expanded, so the default view is "what did I eat", not "here is a form".
export default function FoodRow({ food, otherMeals, badges, onQuantityChange, onRemove, onMove, completion, dbFood }: Props) {
  const locked = food.foodDatabaseId === null
  const unitConfig: UnitConfig = {
    displayUnit: dbFood?.display_unit || 'g',
    gramsPerDisplayUnit: dbFood?.grams_per_display_unit || 1
  }
  const displayQuantity = toDisplayQuantity(food.quantity, unitConfig)
  const isExact = isWholeDisplayQuantity(food.quantity, unitConfig)
  const isPieceLike = requiresGramsPerUnit(unitConfig.displayUnit)

  const [inputValue, setInputValue] = useState(String(displayQuantity))
  const [editing, setEditing] = useState(false)

  const commitQuantity = (displayValue: number) => {
    if (!isFinite(displayValue) || displayValue <= 0) return
    onQuantityChange(toCanonicalGrams(displayValue, unitConfig))
  }

  // Steps by one whole display unit for piece-like foods (1 egg, 1 slice),
  // by a finer 100g increment for kg (0.1kg), or the existing 10-unit step
  // for plain g/ml.
  const stepSize = unitConfig.displayUnit === 'kg' ? 0.1 : isPieceLike ? 1 : QUANTITY_STEP

  const step = (delta: number) => {
    const next = Math.max(stepSize, displayQuantity + delta)
    setInputValue(String(next))
    commitQuantity(next)
  }

  return (
    <div className="py-2 border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-2">
        {completion && (
          <button
            type="button"
            role="checkbox"
            aria-checked={completion.completed}
            aria-label={completion.completed ? `Mark ${food.name} as not eaten` : `Mark ${food.name} as eaten`}
            onClick={completion.onToggle}
            disabled={completion.toggling}
            className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed ${
              completion.completed
                ? 'bg-success/15 text-success'
                : 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
            }`}
          >
            {completion.toggling ? (
              <SpinnerIcon size={16} className="animate-spin" />
            ) : completion.completed ? (
              <CheckIcon size={16} />
            ) : (
              <CircleIcon size={16} />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setEditing(e => !e)}
          aria-expanded={editing}
          aria-label={`${editing ? 'Collapse' : 'Edit'} ${food.name}`}
          className="min-w-0 flex-1 flex items-center justify-between gap-2 text-left rounded-lg py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-foreground truncate">{food.name}</span>
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
                  title={`${displayQuantity} ${unitLabel(unitConfig.displayUnit, displayQuantity)} is an approximate display of ${Math.round(food.quantity)}g - the exact gram amount is what's actually used for nutrition.`}
                >
                  Approx.
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap font-mono tabular-nums text-xs mt-0.5">
              <span className="font-semibold text-foreground">
                {displayQuantity} {unitLabel(unitConfig.displayUnit, displayQuantity)}
              </span>
              <span className="text-border">·</span>
              <span className="text-foreground/70">{Math.round(food.calories)} kcal</span>
              <span className="text-protein">{Math.round(food.protein)}P</span>
              <span className="text-carbs">{Math.round(food.carbs)}C</span>
              <span className="text-fat">{Math.round(food.fat)}F</span>
            </div>
          </div>
          <ChevronDownIcon
            size={14}
            className={`shrink-0 text-muted-foreground/50 transition-transform duration-150 ${editing ? 'rotate-180' : ''}`}
          />
        </button>

        <button
          onClick={onRemove}
          aria-label={`Remove ${food.name}`}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-error hover:bg-error/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {editing && (
        <div className="flex items-center gap-2 flex-wrap mt-2 pl-[52px]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => step(-stepSize)}
              disabled={locked}
              aria-label={`Decrease ${food.name} quantity`}
              className="w-11 h-11 flex items-center justify-center rounded-lg bg-surface-elevated border border-border hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <MinusIcon size={16} />
            </button>
            <input
              type="number"
              value={inputValue}
              disabled={locked}
              onChange={e => setInputValue(e.target.value)}
              onBlur={() => commitQuantity(parseFloat(inputValue))}
              aria-label={`${food.name} quantity in ${unitLabel(unitConfig.displayUnit, displayQuantity)}`}
              className="w-16 min-h-[44px] text-center bg-surface border border-border rounded-lg text-sm font-mono tabular-nums disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="text-sm font-semibold text-foreground">
              {unitLabel(unitConfig.displayUnit, displayQuantity)}
            </span>
            <button
              onClick={() => step(stepSize)}
              disabled={locked}
              aria-label={`Increase ${food.name} quantity`}
              className="w-11 h-11 flex items-center justify-center rounded-lg bg-surface-elevated border border-border hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <PlusIcon size={16} />
            </button>
          </div>

          {otherMeals.length > 0 && (
            <select
              value=""
              onChange={e => {
                if (e.target.value) onMove(e.target.value)
              }}
              aria-label={`Move ${food.name} to another meal`}
              className="min-h-[44px] text-xs bg-surface-elevated border border-border rounded-lg px-2 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Move to...</option>
              {otherMeals.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
