'use client'

import { useState } from 'react'
import { computeMealTotals, getFoodBadges, type ChangeEntry, type DraftMeal } from '@/lib/diet/diff'
import FoodRow from './FoodRow'
import AddFoodPopover from './AddFoodPopover'
import type { FoodOption } from './DietEditor'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { PlusIcon } from '@/components/ui/icons'

type Props = {
  meal: DraftMeal
  allMeals: DraftMeal[]
  changes: ChangeEntry[]
  foodOptions: FoodOption[]
  onQuantityChange: (foodId: string, quantity: number) => void
  onRemoveFood: (foodId: string) => void
  onAddFood: (foodDatabaseId: string, quantity: number) => void
  onMoveFood: (foodId: string, toMealId: string) => void
}

export default function MealCard({
  meal,
  allMeals,
  changes,
  foodOptions,
  onQuantityChange,
  onRemoveFood,
  onAddFood,
  onMoveFood
}: Props) {
  const [showAddFood, setShowAddFood] = useState(false)
  const totals = computeMealTotals(meal)
  const otherMeals = allMeals.filter(m => m.id !== meal.id)
  const isNewMeal = changes.some(c => c.type === 'meal-added' && c.mealName === meal.name)

  return (
    <Card className="p-6 flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-display text-xl font-bold text-foreground truncate">{meal.name}</h3>
          {isNewMeal && <Badge variant="success">New</Badge>}
        </div>
        <span className="shrink-0 font-mono tabular-nums text-sm font-semibold text-muted-foreground bg-surface-elevated border border-border px-3 py-1 rounded-full">
          {Math.round(totals.calories)} kcal
        </span>
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

      <div className="mt-6 pt-4 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
        <span>Meal Totals:</span>
        <div className="flex gap-4 font-mono tabular-nums">
          <span className="text-protein">{Math.round(totals.protein)}g P</span>
          <span className="text-carbs">{Math.round(totals.carbs)}g C</span>
          <span className="text-fat">{Math.round(totals.fat)}g F</span>
        </div>
      </div>
    </Card>
  )
}
