'use client'

import { useMemo } from 'react'
import { computeMealTotals, computeDailyTotals, type DraftMeal } from '@/lib/diet/diff'
import { toDisplayQuantity, unitLabel, type UnitConfig } from '@/lib/nutrition/units'
import { formatMealName } from '@/lib/nutrition/workoutMeals'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'
import { getFoodEmoji } from '@/lib/food/foodEmojiMap'

type Targets = { calories: number; protein: number; carbs: number; fat: number }

type Props = {
  meals: DraftMeal[]
  targets: Targets
  foodOptions: FoodOption[]
}

export default function FinalReviewStep({ meals, targets, foodOptions }: Props) {
  const foodOptionsById = useMemo(() => {
    const map = new Map<string, FoodOption>()
    for (const f of foodOptions) map.set(f.id, f)
    return map
  }, [foodOptions])

  const dailyTotals = useMemo(() => computeDailyTotals(meals), [meals])

  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Review your plan</h1>
        <p className="text-muted-foreground">Here&apos;s your complete meal plan. Create it to start using it today.</p>
      </div>

      <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-3">
        {/* Two explicitly separate concepts: "Your plan" is the actual totals
            from the foods/quantities the user chose and is exactly what gets
            saved; "Daily target" is guidance only. Deliberately no
            on/over/under status badge here - a manual plan is never "wrong"
            for sitting above or below the target. */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Your plan</span>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono tabular-nums text-sm">
            <span className="font-bold text-calories">{Math.round(dailyTotals.calories)} kcal</span>
            <span className="text-protein">{Math.round(dailyTotals.protein)}g P</span>
            <span className="text-carbs">{Math.round(dailyTotals.carbs)}g C</span>
            <span className="text-fat">{Math.round(dailyTotals.fat)}g F</span>
          </div>
        </div>
        <div className="space-y-1 pt-2 border-t border-border">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Daily target (reference)</span>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono tabular-nums text-sm text-muted-foreground">
            <span>{Math.round(targets.calories)} kcal</span>
            <span>{Math.round(targets.protein)}g P</span>
            <span>{Math.round(targets.carbs)}g C</span>
            <span>{Math.round(targets.fat)}g F</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Your target is a reference. Your meal plan is saved exactly as you built it.
        </p>
      </div>

      <div className="space-y-4">
        {meals.map(meal => {
          const mealTotals = computeMealTotals(meal)
          return (
            <div key={meal.id} className="p-4 rounded-control border border-border space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-display font-semibold text-foreground">{formatMealName(meal.name)}</h3>
                <div className="flex flex-wrap items-baseline gap-x-2 font-mono tabular-nums text-xs">
                  <span className="font-bold text-calories">{Math.round(mealTotals.calories)} kcal</span>
                  <span className="text-protein">{Math.round(mealTotals.protein)}P</span>
                  <span className="text-carbs">{Math.round(mealTotals.carbs)}C</span>
                  <span className="text-fat">{Math.round(mealTotals.fat)}F</span>
                </div>
              </div>
              {meal.foods.length === 0 ? (
                <p className="text-sm text-muted-foreground">No foods in this meal.</p>
              ) : (
                <ul className="space-y-1">
                  {meal.foods.map(food => {
                    const dbFood = food.foodDatabaseId ? foodOptionsById.get(food.foodDatabaseId) : null
                    const unitConfig: UnitConfig = {
                      displayUnit: dbFood?.display_unit || 'g',
                      gramsPerDisplayUnit: dbFood?.grams_per_display_unit || 1
                    }
                    const displayQuantity = toDisplayQuantity(food.quantity, unitConfig)
                    const unit = unitLabel(unitConfig.displayUnit, displayQuantity)
                    return (
                      <li key={food.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span aria-hidden="true" className="shrink-0">{getFoodEmoji(food.name)}</span>
                          <span className="text-foreground truncate">{food.name}</span>
                        </span>
                        <span className="font-mono tabular-nums text-xs text-muted-foreground shrink-0">
                          {displayQuantity} {unit}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
