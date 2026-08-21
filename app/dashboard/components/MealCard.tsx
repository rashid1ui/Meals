'use client'

import { useState } from 'react'
import { computeMealTotals, getFoodBadges, type ChangeEntry, type DraftMeal } from '@/lib/diet/diff'
import FoodRow from './FoodRow'
import AddFoodPopover from './AddFoodPopover'
import type { FoodOption } from './DietEditor'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { PlusIcon, CheckIcon, CircleIcon, HalfCircleIcon, SpinnerIcon } from '@/components/ui/icons'

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
  // Undefined for a meal that hasn't been saved yet (e.g. added but not
  // saved this session) - tracking only ever applies to persisted meals,
  // so the toggle is simply omitted rather than shown disabled.
  completion?: MealCompletionInfo
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
  completion
}: Props) {
  const [showAddFood, setShowAddFood] = useState(false)
  const totals = computeMealTotals(meal)
  const otherMeals = allMeals.filter(m => m.id !== meal.id)
  const isNewMeal = changes.some(c => c.type === 'meal-added' && c.mealName === meal.name)
  const status = completion?.status ?? 'none'

  return (
    <Card className="p-6 flex flex-col">
      <div className="border-b border-border pb-4 mb-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-display text-xl font-bold text-foreground truncate">{meal.name}</h3>
            {isNewMeal && <Badge variant="success">New</Badge>}
            {completion && status !== 'none' && (
              <Badge variant={status === 'complete' ? 'success' : 'warning'}>{STATUS_LABEL[status]}</Badge>
            )}
          </div>
          <span className="shrink-0 font-mono tabular-nums text-sm font-semibold text-muted-foreground bg-surface-elevated border border-border px-3 py-1 rounded-full">
            {Math.round(totals.calories)} kcal
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-3 flex-wrap font-mono tabular-nums text-xs font-semibold">
            <span className="text-protein">Protein {Math.round(totals.protein)}g</span>
            <span className="text-carbs">Carbs {Math.round(totals.carbs)}g</span>
            <span className="text-fat">Fat {Math.round(totals.fat)}g</span>
          </div>
          {completion && (
            <button
              type="button"
              role="checkbox"
              aria-checked={status === 'complete' ? true : status === 'partial' ? 'mixed' : false}
              aria-label={status === 'complete' ? `Mark ${meal.name} as not eaten` : `Mark ${meal.name} as eaten`}
              onClick={completion.onToggleMeal}
              disabled={completion.togglingMeal}
              className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed ${
                status === 'complete'
                  ? 'bg-success/15 border-success/40 text-success'
                  : status === 'partial'
                    ? 'bg-warning/15 border-warning/40 text-warning'
                    : 'bg-surface-elevated border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {completion.togglingMeal ? (
                <SpinnerIcon size={18} className="animate-spin" />
              ) : status === 'complete' ? (
                <CheckIcon size={18} />
              ) : status === 'partial' ? (
                <HalfCircleIcon size={18} />
              ) : (
                <CircleIcon size={18} />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3">
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
        />
      ) : (
        <button
          onClick={() => setShowAddFood(true)}
          className="mt-4 w-full min-h-[44px] flex items-center justify-center gap-2 px-4 text-sm font-semibold text-muted-foreground bg-transparent border border-dashed border-border hover:border-primary hover:text-primary rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <PlusIcon size={16} />
          Add Food
        </button>
      )}
    </Card>
  )
}
