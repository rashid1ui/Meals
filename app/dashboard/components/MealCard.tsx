'use client'

import { useState } from 'react'
import { computeMealTotals, getFoodBadges, type ChangeEntry, type DraftMeal } from '@/lib/diet/diff'
import FoodRow from './FoodRow'
import AddFoodPopover from './AddFoodPopover'
import type { FoodOption } from './DietEditor'

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
    <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold">{meal.name}</h3>
          {isNewMeal && (
            <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full border bg-green-500/15 text-green-400 border-green-500/30">
              New
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400 font-semibold bg-gray-800/50 px-3 py-1 rounded-full">
          {Math.round(totals.calories)} kcal
        </div>
      </div>

      <div className="flex-1 space-y-4">
        {meal.foods.length === 0 && !showAddFood && (
          <p className="text-sm text-gray-500">No foods yet.</p>
        )}
        {meal.foods.map(food => (
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
        ))}
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
          className="mt-4 w-full px-4 py-2 text-sm bg-[#0B0E14] border border-dashed border-gray-700 hover:border-indigo-500 rounded-xl font-semibold text-gray-400 hover:text-indigo-400 transition-all"
        >
          + Add Food
        </button>
      )}

      <div className="mt-6 pt-4 border-t border-gray-800/50 flex justify-between text-xs text-gray-500">
        <span>Meal Totals:</span>
        <div className="flex gap-4">
          <span>{Math.round(totals.protein)}g P</span>
          <span>{Math.round(totals.carbs)}g C</span>
          <span>{Math.round(totals.fat)}g F</span>
        </div>
      </div>
    </div>
  )
}
