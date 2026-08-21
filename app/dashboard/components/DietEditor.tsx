'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import { diffMeals, computeDailyTotals, type DraftMeal, type DraftFood } from '@/lib/diet/diff'
import { saveDietPlan } from '../actions'
import type { SaveDietPlanPayload } from '@/lib/diet/save-plan'
import MealCard from './MealCard'
import AddMealModal from './AddMealModal'
import ChangeSummaryPanel from './ChangeSummaryPanel'
import MacroSummaryCards from './MacroSummaryCards'
import Button from '@/components/ui/Button'
import { PlusIcon } from '@/components/ui/icons'

export interface FoodOption extends FoodMacro {
  category: string
}

export interface Targets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type Props = {
  initialMeals: DraftMeal[]
  targets: Targets
  foodOptions: FoodOption[]
}

function cloneMeals(meals: DraftMeal[]): DraftMeal[] {
  return meals.map(m => ({ ...m, foods: m.foods.map(f => ({ ...f })) }))
}

export default function DietEditor({ initialMeals, targets, foodOptions }: Props) {
  const router = useRouter()

  const [draft, setDraft] = useState<DraftMeal[]>(() => cloneMeals(initialMeals))
  const [history, setHistory] = useState<DraftMeal[][]>([])
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const foodOptionsById = useMemo(() => {
    const map = new Map<string, FoodOption>()
    for (const f of foodOptions) map.set(f.id, f)
    return map
  }, [foodOptions])

  const changes = useMemo(() => diffMeals(initialMeals, draft), [initialMeals, draft])
  const dailyTotals = useMemo(() => computeDailyTotals(draft), [draft])
  const hasChanges = changes.length > 0

  // A ref-based counter (not Date.now()/Math.random()) so id generation stays
  // pure during render - these ids only need to be unique within this
  // component's lifetime, never sent anywhere requiring global uniqueness.
  const idCounter = useRef(0)
  const nextTempId = (prefix: string) => `${prefix}-${idCounter.current++}`

  const commit = (updater: (current: DraftMeal[]) => DraftMeal[]) => {
    setHistory(h => [...h, cloneMeals(draft)])
    setDraft(current => updater(current))
    setSaveError(null)
    setJustSaved(false)
  }

  // Auto-clears the brief "Changes saved" confirmation.
  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2500)
    return () => clearTimeout(timer)
  }, [justSaved])

  const handleQuantityChange = (mealId: string, foodId: string, newQuantity: number) => {
    commit(current => current.map(meal => {
      if (meal.id !== mealId) return meal
      return {
        ...meal,
        foods: meal.foods.map(food => {
          if (food.id !== foodId || !food.foodDatabaseId) return food
          const dbFood = foodOptionsById.get(food.foodDatabaseId)
          if (!dbFood) return food
          const calculated = calculateFoodMacros(newQuantity, dbFood)
          return {
            ...food,
            quantity: calculated.quantity,
            calories: calculated.calories,
            protein: calculated.protein,
            carbs: calculated.carbs,
            fat: calculated.fat
          }
        })
      }
    }))
  }

  const handleRemoveFood = (mealId: string, foodId: string) => {
    commit(current => current.map(meal => {
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
    commit(current => current.map(meal => (
      meal.id === mealId ? { ...meal, foods: [...meal.foods, newFood] } : meal
    )))
  }

  const handleMoveFood = (foodId: string, fromMealId: string, toMealId: string) => {
    if (fromMealId === toMealId) return
    commit(current => {
      let moved: DraftFood | null = null
      const withoutFood = current.map(meal => {
        if (meal.id !== fromMealId) return meal
        const food = meal.foods.find(f => f.id === foodId)
        if (food) moved = food
        return { ...meal, foods: meal.foods.filter(f => f.id !== foodId) }
      })
      if (!moved) return current
      return withoutFood.map(meal => (
        meal.id === toMealId ? { ...meal, foods: [...meal.foods, moved as DraftFood] } : meal
      ))
    })
  }

  const handleAddMeal = (name: string) => {
    const newMeal: DraftMeal = {
      id: nextTempId('new-meal'),
      name,
      sortOrder: draft.length,
      foods: []
    }
    commit(current => [...current, newMeal])
    setShowAddMeal(false)
  }

  const handleUndo = () => {
    if (history.length === 0) return
    const previous = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setDraft(previous)
    setSaveError(null)
  }

  const handleDiscard = () => {
    setDraft(cloneMeals(initialMeals))
    setHistory([])
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!hasChanges || saving) return
    setSaving(true)
    setSaveError(null)

    const payload: SaveDietPlanPayload = {
      meals: draft.map(meal => ({
        name: meal.name,
        foods: meal.foods.map(food => ({
          foodDatabaseId: food.foodDatabaseId,
          originalFoodId: food.foodDatabaseId ? null : food.id,
          quantity: food.quantity,
          unit: food.unit
        }))
      }))
    }

    try {
      const result = await saveDietPlan(payload)
      if ('error' in result) {
        setSaveError(result.error)
        setSaving(false)
        return
      }
      setHistory([])
      setJustSaved(true)
      router.refresh()
    } catch {
      setSaveError('An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Section 1 - Today's Nutrition: strongest visual weight, answers
          "how am I doing today?" at a glance. */}
      <MacroSummaryCards totals={dailyTotals} targets={targets} />

      {/* Section 2 - Today's Meals: the primary actionable area, answers
          "what should I eat?". */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="font-display text-2xl font-bold text-foreground tracking-tight">Today&apos;s Meals</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowAddMeal(true)}>
            <PlusIcon size={16} />
            Add Meal
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {draft.map(meal => (
            <MealCard
              key={meal.id}
              meal={meal}
              allMeals={draft}
              changes={changes}
              foodOptions={foodOptions}
              onQuantityChange={(foodId, qty) => handleQuantityChange(meal.id, foodId, qty)}
              onRemoveFood={(foodId) => handleRemoveFood(meal.id, foodId)}
              onAddFood={(dbFoodId, qty) => handleAddFood(meal.id, dbFoodId, qty)}
              onMoveFood={(foodId, toMealId) => handleMoveFood(foodId, meal.id, toMealId)}
            />
          ))}
        </div>
      </div>

      {/* Section 3 - Change Summary: visually secondary, answers "what did
          I change?" only when relevant. */}
      <ChangeSummaryPanel
        changes={changes}
        canUndo={history.length > 0}
        hasChanges={hasChanges}
        saving={saving}
        saveError={saveError}
        justSaved={justSaved}
        onUndo={handleUndo}
        onDiscard={handleDiscard}
        onSave={handleSave}
      />

      {showAddMeal && (
        <AddMealModal onAdd={handleAddMeal} onCancel={() => setShowAddMeal(false)} />
      )}
    </div>
  )
}
