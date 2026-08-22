'use client'

import { useMemo, useState } from 'react'
import { computeMealTotals, getFoodBadges, type ChangeEntry, type DraftMeal } from '@/lib/diet/diff'
import { pctOf, type MacroTotals } from '@/lib/tracking/logic'
import { formatMealName } from '@/lib/nutrition/workoutMeals'
import type { FoodTrackingState } from '../tracking-actions'
import FoodRow from './FoodRow'
import AddFoodPopover from './AddFoodPopover'
import type { FoodOption } from './DietEditor'
import Card from '@/components/ui/Card'
import TrackingStatusIcon from '@/components/ui/TrackingStatusIcon'
import { PlusIcon, CheckIcon, SpinnerIcon } from '@/components/ui/icons'

const STATUS_TEXT_CLASS: Record<MealTrackingStatus, string> = {
  none: 'text-muted-foreground hover:text-foreground',
  partial: 'text-warning',
  complete: 'text-success'
}

export type MealTrackingStatus = 'none' | 'partial' | 'complete'

export type MealCompletionInfo = {
  status: MealTrackingStatus
  // What this meal is supposed to deliver in total vs. what's actually been
  // logged as eaten from it today - two distinct numbers, never merged.
  planned: MacroTotals
  actual: MacroTotals
  foods: ReadonlyMap<string, FoodTrackingState>
  onToggleMeal: () => void
  onLogFood: (foodId: string, consumedQuantity: number) => void
  togglingMeal: boolean
  loggingFoodId: string | null
}

type Props = {
  meal: DraftMeal
  changes: ChangeEntry[]
  foodOptions: FoodOption[]
  onRemoveFood: (foodId: string) => void
  onAddFood: (foodDatabaseId: string, quantity: number) => void
  onUpdateFoodQuantity?: (foodId: string, quantity: number) => void
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
  changes,
  foodOptions,
  onRemoveFood,
  onAddFood,
  onUpdateFoodQuantity,
  onFoodCreated,
  completion,
  isNext = false
}: Props) {
  const [showAddFood, setShowAddFood] = useState(false)
  const target = computeMealTotals(meal)
  const isNewMeal = changes.some(c => c.type === 'meal-added' && c.mealName === meal.name)
  const status = completion?.status ?? 'none'
  // Visually quiet down an already-eaten meal that isn't the one to focus on
  // next - via reduced elevation/border emphasis, never by dimming text
  // opacity (would erode the 4.5:1 contrast the rest of the app guarantees).
  const recede = status === 'complete' && !isNext

  const actual = completion?.actual ?? null
  const actualPct = actual && target.calories > 0 ? Math.round(pctOf(actual.calories, target.calories)) : null

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
      <div className="border-b border-border pb-3 mb-3 space-y-2.5">
        {/* Eyebrow: Next (static label) + the meal-completion state, which
            IS the toggle button - reads as plain status text ("○ Not
            eaten") rather than a heavy standalone control, while staying
            fully clickable with a 44px-tall hit area via padding. This is a
            bulk-apply shortcut over the same per-food logging below, never
            an independently-stored flag - see deriveMealStatus. */}
        {(isNext || isNewMeal || completion) && (
          <div className="flex items-center gap-2 flex-wrap -mt-1 -ml-1">
            {isNext && (
              <span className="text-[11px] font-bold uppercase tracking-wide text-primary px-1">Next</span>
            )}
            {isNewMeal && (
              <span className="text-[11px] font-bold uppercase tracking-wide text-success px-1">New</span>
            )}
            {completion && (
              <button
                type="button"
                role="checkbox"
                aria-checked={status === 'complete' ? true : status === 'partial' ? 'mixed' : false}
                aria-label={status === 'complete' ? `Mark ${meal.name} as not eaten` : `Mark all of ${meal.name} as eaten`}
                onClick={completion.onToggleMeal}
                disabled={completion.togglingMeal}
                className={`inline-flex items-center gap-1.5 min-h-[44px] px-1 rounded-md text-xs font-semibold transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${STATUS_TEXT_CLASS[status]}`}
              >
                {completion.togglingMeal ? (
                  <SpinnerIcon size={16} className="animate-spin" />
                ) : (
                  <TrackingStatusIcon status={status} size={20} />
                )}
                {STATUS_LABEL[status]}
              </button>
            )}
          </div>
        )}

        <h3 className="font-display text-xl font-bold text-foreground truncate flex items-center gap-2">
          {status === 'complete' && <CheckIcon size={18} className="text-success shrink-0" />}
          {formatMealName(meal.name)}
        </h3>

        {/* Target vs Actual - two explicitly labeled rows so the numbers are
            never ambiguous about which one they are. Actual only renders
            once this meal is trackable (persisted + has foods); an
            unsaved/empty meal shows Target alone. */}
        <div className="grid grid-cols-[3.25rem_1fr] gap-x-2 gap-y-1 items-baseline">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Target</span>
          <div className="flex flex-wrap items-baseline gap-x-2 font-mono tabular-nums text-sm">
            <span className="font-bold text-calories">{Math.round(target.calories)} kcal</span>
            <span className="text-protein">{Math.round(target.protein)}P</span>
            <span className="text-carbs">{Math.round(target.carbs)}C</span>
            <span className="text-fat">{Math.round(target.fat)}F</span>
          </div>

          {actual && meal.foods.length > 0 && (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Actual</span>
              <div className="flex flex-wrap items-baseline gap-x-2 font-mono tabular-nums text-sm">
                <span className="font-bold text-foreground">{Math.round(actual.calories)} kcal</span>
                <span className="text-protein">{Math.round(actual.protein)}P</span>
                <span className="text-carbs">{Math.round(actual.carbs)}C</span>
                <span className="text-fat">{Math.round(actual.fat)}F</span>
              </div>
            </>
          )}
        </div>

        {actual && meal.foods.length > 0 && (
          <div className="pt-0.5 space-y-1">
            <div className="flex items-center justify-end">
              <span className="text-xs font-mono tabular-nums font-semibold text-primary">
                {actualPct}% complete
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${meal.name} actual calories eaten toward its target`}
              aria-valuenow={Math.round(actual.calories)}
              aria-valuemin={0}
              aria-valuemax={Math.round(target.calories)}
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
          <div className="text-center py-6 px-4 rounded-control border border-dashed border-border">
            <p className="text-sm font-semibold text-foreground">No foods in this meal yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add a food to start building this meal.</p>
          </div>
        ) : (
          meal.foods.map(food => {
            const foodTracking = completion?.foods.get(food.id)
            return (
              <FoodRow
                key={food.id}
                food={food}
                meal={meal}
                badges={getFoodBadges(changes, food.id)}
                onRemove={() => onRemoveFood(food.id)}
                dbFood={food.foodDatabaseId ? foodOptionsById.get(food.foodDatabaseId) ?? null : null}
                onUpdateQuantity={onUpdateFoodQuantity ? (q) => onUpdateFoodQuantity(food.id, q) : undefined}
                completion={
                  completion && foodTracking
                    ? {
                        status: foodTracking.status,
                        consumedQuantity: foodTracking.consumedQuantity,
                        plannedQuantity: foodTracking.plannedQuantity,
                        actual: foodTracking.actual,
                        onLog: (consumedQuantity) => completion.onLogFood(food.id, consumedQuantity),
                        logging: completion.loggingFoodId === food.id
                      }
                    : undefined
                }
              />
            )
          })
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
          className="w-full min-h-[44px] flex items-center gap-1.5 px-1 pt-2.5 mt-1 border-t border-border/60 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-control"
        >
          <PlusIcon size={14} />
          Add food
        </button>
      )}
    </Card>
  )
}
