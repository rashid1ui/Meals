'use client'

import { useMemo, useState } from 'react'
import { computeMealTotals, getFoodBadges, type ChangeEntry, type DraftMeal } from '@/lib/diet/diff'
import { sumCompletedMacros, pctOf } from '@/lib/tracking/logic'
import FoodRow from './FoodRow'
import AddFoodPopover from './AddFoodPopover'
import type { FoodOption } from './DietEditor'
import Card from '@/components/ui/Card'
import { PlusIcon, CheckIcon, CircleIcon, HalfCircleIcon, SpinnerIcon } from '@/components/ui/icons'

const STATUS_ICON: Record<MealTrackingStatus, typeof CheckIcon> = {
  none: CircleIcon,
  partial: HalfCircleIcon,
  complete: CheckIcon
}

const STATUS_TEXT_CLASS: Record<MealTrackingStatus, string> = {
  none: 'text-muted-foreground hover:text-foreground',
  partial: 'text-warning',
  complete: 'text-success'
}

export type MealTrackingStatus = 'none' | 'partial' | 'complete'

export type MealCompletionInfo = {
  status: MealTrackingStatus
  completedFoodIds: ReadonlySet<string>
  onToggleMeal: () => void
  onToggleFood: (foodId: string) => void
  togglingMeal: boolean
  togglingFoodId: string | null
}

type Props = {
  meal: DraftMeal
  allMeals: DraftMeal[]
  changes: ChangeEntry[]
  foodOptions: FoodOption[]
  onQuantityChange: (foodId: string, quantity: number) => void
  onRemoveFood: (foodId: string) => void
  onAddFood: (foodDatabaseId: string, quantity: number) => void
  onMoveFood: (foodId: string, toMealId: string) => void
  onFoodCreated?: (food: FoodOption) => void
  // Undefined for a meal that hasn't been saved yet (e.g. added but not
  // saved this session) - tracking only ever applies to persisted meals,
  // so the toggle is simply omitted rather than shown disabled.
  completion?: MealCompletionInfo
  // True for the single next-up (first non-complete, persisted) meal -
  // gets stronger visual hierarchy. See DietEditor's `nextMeal`.
  isNext?: boolean
}

const STATUS_LABEL: Record<MealTrackingStatus, string> = {
  none: 'Not eaten',
  partial: 'Partially eaten',
  complete: 'Eaten'
}

export default function MealCard({
  meal,
  allMeals,
  changes,
  foodOptions,
  onQuantityChange,
  onRemoveFood,
  onAddFood,
  onMoveFood,
  onFoodCreated,
  completion,
  isNext = false
}: Props) {
  const [showAddFood, setShowAddFood] = useState(false)
  const totals = computeMealTotals(meal)
  const otherMeals = allMeals.filter(m => m.id !== meal.id)
  const isNewMeal = changes.some(c => c.type === 'meal-added' && c.mealName === meal.name)
  const status = completion?.status ?? 'none'
  // Visually quiet down an already-eaten meal that isn't the one to focus on
  // next - via reduced elevation/border emphasis, never by dimming text
  // opacity (would erode the 4.5:1 contrast the rest of the app guarantees).
  const recede = status === 'complete' && !isNext

  // "Actual" = sum of only the foods marked eaten today, using the same
  // pure sumCompletedMacros already relied on by tracking-actions.ts - this
  // is a display-only filter/sum of data already on the page, not a second
  // nutrition calculation.
  const actual = completion ? sumCompletedMacros(meal.foods, completion.completedFoodIds) : null
  const actualPct = actual && totals.calories > 0 ? Math.round(pctOf(actual.calories, totals.calories)) : null

  const foodOptionsById = useMemo(() => {
    const map = new Map<string, FoodOption>()
    for (const f of foodOptions) map.set(f.id, f)
    return map
  }, [foodOptions])

  return (
    <Card
      id={`meal-${meal.id}`}
      tabIndex={-1}
      elevated={isNext}
      className={`p-6 flex flex-col scroll-mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isNext ? 'border-primary/50' : ''
      } ${recede ? 'opacity-[0.92]' : ''}`}
    >
      <div className="border-b border-border pb-3 mb-3 space-y-2">
        {/* Eyebrow: Next (static label) + the meal-completion state, which
            IS the toggle button - reads as plain status text ("○ Not
            eaten") rather than a heavy standalone control, while staying
            fully clickable with a 44px-tall hit area via padding. */}
        {(isNext || isNewMeal || completion) && (
          <div className="flex items-center gap-2 flex-wrap -mt-1 -ml-1">
            {isNext && (
              <span className="text-[11px] font-bold uppercase tracking-wide text-primary px-1">Next</span>
            )}
            {isNewMeal && (
              <span className="text-[11px] font-bold uppercase tracking-wide text-success px-1">New</span>
            )}
            {completion && (() => {
              const StatusIcon = STATUS_ICON[status]
              return (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={status === 'complete' ? true : status === 'partial' ? 'mixed' : false}
                  aria-label={status === 'complete' ? `Mark ${meal.name} as not eaten` : `Mark ${meal.name} as eaten`}
                  onClick={completion.onToggleMeal}
                  disabled={completion.togglingMeal}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-1 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${STATUS_TEXT_CLASS[status]}`}
                >
                  {completion.togglingMeal ? (
                    <SpinnerIcon size={14} className="animate-spin" />
                  ) : (
                    <StatusIcon size={14} />
                  )}
                  {STATUS_LABEL[status]}
                </button>
              )
            })()}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xl font-bold text-foreground truncate flex items-center gap-2">
            {status === 'complete' && <CheckIcon size={18} className="text-success shrink-0" />}
            {meal.name}
          </h3>
          <span className="shrink-0 font-mono tabular-nums text-sm font-semibold text-muted-foreground">
            {Math.round(totals.calories)} kcal
          </span>
        </div>

        {/* Macro summary - highest-priority scan line after name/kcal, so
            each value+label pair stays a single colored unit rather than a
            neutral label next to a colored number. */}
        <div className="flex gap-x-3 gap-y-1 flex-wrap font-mono tabular-nums text-sm font-semibold">
          <span className="text-protein">{Math.round(totals.protein)}g Protein</span>
          <span className="text-carbs">{Math.round(totals.carbs)}g Carbs</span>
          <span className="text-fat">{Math.round(totals.fat)}g Fat</span>
        </div>

        {/* Target vs actual - compact fraction + bar, not a second stat
            block. Only meaningful once there's something to eat. */}
        {actual && meal.foods.length > 0 && (
          <div className="pt-1 space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs font-mono tabular-nums text-muted-foreground">
              <span>
                <span className="font-bold text-foreground">{Math.round(actual.calories)}</span>
                {' / '}
                {Math.round(totals.calories)} kcal
              </span>
              <span className="font-semibold text-primary">{actualPct}% complete</span>
            </div>
            <div
              role="progressbar"
              aria-label={`${meal.name} actual calories eaten toward its target`}
              aria-valuenow={Math.round(actual.calories)}
              aria-valuemin={0}
              aria-valuemax={Math.round(totals.calories)}
              className="h-1.5 rounded-full bg-surface-elevated overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.min(100, actualPct ?? 0)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1">
        {meal.foods.length > 0 && (
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Foods
          </span>
        )}
        {meal.foods.length === 0 && !showAddFood ? (
          <div className="text-center py-6 px-4 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold text-foreground">No foods in this meal yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add a food to start building this meal.</p>
          </div>
        ) : (
          meal.foods.map(food => (
            <FoodRow
              key={food.id}
              food={food}
              meal={meal}
              otherMeals={otherMeals}
              badges={getFoodBadges(changes, food.id)}
              onQuantityChange={(qty) => onQuantityChange(food.id, qty)}
              onRemove={() => onRemoveFood(food.id)}
              onMove={(toMealId) => onMoveFood(food.id, toMealId)}
              dbFood={food.foodDatabaseId ? foodOptionsById.get(food.foodDatabaseId) ?? null : null}
              completion={
                completion
                  ? {
                      completed: completion.completedFoodIds.has(food.id),
                      onToggle: () => completion.onToggleFood(food.id),
                      toggling: completion.togglingFoodId === food.id
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>

      {showAddFood ? (
        <AddFoodPopover
          foodOptions={foodOptions}
          onAdd={(foodDatabaseId, quantity) => {
            onAddFood(foodDatabaseId, quantity)
            setShowAddFood(false)
          }}
          onClose={() => setShowAddFood(false)}
          onFoodCreated={onFoodCreated}
        />
      ) : (
        <button
          onClick={() => setShowAddFood(true)}
          className="w-full min-h-[44px] flex items-center gap-1.5 px-1 pt-2.5 mt-1 border-t border-border/60 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        >
          <PlusIcon size={14} />
          Add food
        </button>
      )}
    </Card>
  )
}
