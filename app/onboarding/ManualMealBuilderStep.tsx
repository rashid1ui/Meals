'use client'

import { useMemo, useState } from 'react'
import { calculateFoodMacros } from '@/lib/nutrition/calculator'
import { computeDailyTotals, moveFood, uniqueMealName, type DraftMeal, type DraftFood } from '@/lib/diet/diff'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'
import MealCard from '@/app/dashboard/components/MealCard'
import AddMealModal from '@/app/dashboard/components/AddMealModal'
import SmartGuidancePanels, { type Targets } from './SmartGuidancePanels'
import Button from '@/components/ui/Button'
import { PlusIcon } from '@/components/ui/icons'

// The manual food library additionally carries the protein/carb source
// classifications (see lib/nutrition/proteinType.ts / lib/nutrition/carbType.ts)
// so the Smart Nutrition Guidance panels below can build their lookups
// directly from the same food options the builder itself uses - no separate
// fetch or prop needed.
export interface ManualFoodOption extends FoodOption {
  protein_type?: 'animal' | 'plant' | 'supplement' | null
  carb_type?: 'simple' | 'complex' | null
}

type Props = {
  meals: DraftMeal[]
  setMeals: (updater: (current: DraftMeal[]) => DraftMeal[]) => void
  foodOptions: ManualFoodOption[]
  targets: Targets
  nextTempId: (prefix: string) => string
  onFoodCreated: (food: FoodOption) => void
}

export default function ManualMealBuilderStep({ meals, setMeals, foodOptions, targets, nextTempId, onFoodCreated }: Props) {
  const [showAddMeal, setShowAddMeal] = useState(false)

  const foodOptionsById = useMemo(() => {
    const map = new Map<string, ManualFoodOption>()
    for (const f of foodOptions) map.set(f.id, f)
    return map
  }, [foodOptions])

  const proteinTypeByName = useMemo(() => {
    const map = new Map<string, ManualFoodOption['protein_type']>()
    for (const f of foodOptions) map.set(f.name, f.protein_type)
    return map
  }, [foodOptions])

  const carbTypeByName = useMemo(() => {
    const map = new Map<string, ManualFoodOption['carb_type']>()
    for (const f of foodOptions) map.set(f.name, f.carb_type)
    return map
  }, [foodOptions])

  const categoryByName = useMemo(() => {
    const map = new Map<string, string | null | undefined>()
    for (const f of foodOptions) map.set(f.name, f.category)
    return map
  }, [foodOptions])

  const dailyTotals = useMemo(() => computeDailyTotals(meals), [meals])

  const handleRemoveFood = (mealId: string, foodId: string) => {
    setMeals(current => current.map(meal => {
      if (meal.id !== mealId) return meal
      return { ...meal, foods: meal.foods.filter(f => f.id !== foodId) }
    }))
  }

  const handleAddFood = (mealId: string, dbFoodId: string, quantity: number) => {
    const dbFood = foodOptionsById.get(dbFoodId)
    if (!dbFood) return
    const calculated = calculateFoodMacros(quantity, dbFood)
    const newFood: DraftFood = {
      id: nextTempId('new-food'),
      foodDatabaseId: dbFood.id,
      name: calculated.name,
      quantity: calculated.quantity,
      unit: calculated.unit,
      calories: calculated.calories,
      protein: calculated.protein,
      carbs: calculated.carbs,
      fat: calculated.fat
    }
    setMeals(current => current.map(meal => (
      meal.id === mealId ? { ...meal, foods: [...meal.foods, newFood] } : meal
    )))
  }

  const handleUpdateFoodQuantity = (mealId: string, foodId: string, quantity: number) => {
    setMeals(current => current.map(meal => {
      if (meal.id !== mealId) return meal
      return {
        ...meal,
        foods: meal.foods.map(food => {
          if (food.id !== foodId) return food
          if (!food.foodDatabaseId) return food

          const dbFood = foodOptionsById.get(food.foodDatabaseId)
          if (!dbFood) return food

          const calculated = calculateFoodMacros(quantity, dbFood)
          return {
            ...food,
            quantity: calculated.quantity,
            unit: calculated.unit,
            calories: calculated.calories,
            protein: calculated.protein,
            carbs: calculated.carbs,
            fat: calculated.fat
          }
        })
      }
    }))
  }

  const handleMoveFood = (sourceMealId: string, foodId: string, targetMealId: string) => {
    setMeals(current => moveFood(current, sourceMealId, foodId, targetMealId))
  }

  const handleAddMeal = (name: string) => {
    const newMeal: DraftMeal = {
      id: nextTempId('new-meal'),
      name: uniqueMealName(meals.map(m => m.name), name),
      sortOrder: meals.length,
      foods: []
    }
    setMeals(current => [...current, newMeal])
    setShowAddMeal(false)
  }

  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Build your meals</h1>
        <p className="text-muted-foreground">Add foods to each meal from our library - the guidance below updates as you go.</p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Your Meals</span>
        <Button variant="secondary" size="sm" onClick={() => setShowAddMeal(true)}>
          <PlusIcon size={16} />
          Add Meal
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {meals.map(meal => (
          <MealCard
            key={meal.id}
            meal={meal}
            changes={[]}
            foodOptions={foodOptions}
            onRemoveFood={foodId => handleRemoveFood(meal.id, foodId)}
            onAddFood={(dbFoodId, qty) => handleAddFood(meal.id, dbFoodId, qty)}
            onUpdateFoodQuantity={(foodId, qty) => handleUpdateFoodQuantity(meal.id, foodId, qty)}
            onMoveFood={(foodId, targetMealId) => handleMoveFood(meal.id, foodId, targetMealId)}
            otherMeals={meals.filter(m => m.id !== meal.id).map(m => ({ id: m.id, name: m.name }))}
            onFoodCreated={onFoodCreated}
            dailyTargets={targets}
            dailyTotals={dailyTotals}
          />
        ))}
      </div>

      <SmartGuidancePanels
        dailyTotals={dailyTotals}
        targets={targets}
        meals={meals}
        proteinTypeByName={proteinTypeByName}
        proteinCategoryByName={categoryByName}
        carbTypeByName={carbTypeByName}
        carbCategoryByName={categoryByName}
      />

      {showAddMeal && <AddMealModal onAdd={handleAddMeal} onCancel={() => setShowAddMeal(false)} />}
    </div>
  )
}
