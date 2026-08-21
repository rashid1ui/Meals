'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import { diffMeals, type DraftMeal, type DraftFood } from '@/lib/diet/diff'
import { saveDietPlan } from '../actions'
import {
  getTodayTracking,
  toggleMealCompletion,
  toggleFoodCompletion,
  type DailyTrackingSummary
} from '../tracking-actions'
import { getLocalDateString } from '@/lib/tracking/date'
import type { SaveDietPlanPayload } from '@/lib/diet/save-plan'
import MealCard from './MealCard'
import AddMealModal from './AddMealModal'
import ChangeSummaryPanel from './ChangeSummaryPanel'
import MacroSummaryCards from './MacroSummaryCards'
import DailyProgressSummary from './DailyProgressSummary'
import NextMealSpotlight from './NextMealSpotlight'
import Button from '@/components/ui/Button'
import { PlusIcon, AlertIcon, ChevronRightIcon } from '@/components/ui/icons'

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

export default function DietEditor({ initialMeals, targets, foodOptions: initialFoodOptions }: Props) {
  const router = useRouter()

  // Stateful (not the raw prop) so a food created via "Add a new food" in
  // AddFoodPopover becomes immediately searchable/usable in every meal card
  // this session, without a full page refresh.
  const [foodOptions, setFoodOptions] = useState<FoodOption[]>(initialFoodOptions)
  const handleFoodCreated = (food: FoodOption) => {
    setFoodOptions(prev => (prev.some(f => f.id === food.id) ? prev : [...prev, food]))
  }

  const [draft, setDraft] = useState<DraftMeal[]>(() => cloneMeals(initialMeals))
  const [history, setHistory] = useState<DraftMeal[][]>([])
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // Today's nutrition tracking (consumed vs. target) - a separate concern
  // from the planning draft above. Toggling a meal never touches
  // draft/history/hasChanges; it's a "did I eat this" event persisted
  // through its own server action, not a planned-content edit.
  // Lazy initializer (not an effect) - runs once on the client during first
  // render, so there's no synchronous setState-in-effect to trigger extra
  // renders.
  const [localDate] = useState<string>(() => getLocalDateString())
  const [dailyTracking, setDailyTracking] = useState<DailyTrackingSummary | null>(null)
  const [trackingLoading, setTrackingLoading] = useState(true)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [togglingMealId, setTogglingMealId] = useState<string | null>(null)
  const [togglingFoodId, setTogglingFoodId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTodayTracking(localDate).then(result => {
      if (cancelled) return
      if ('error' in result) setTrackingError(result.error)
      else setDailyTracking(result.data)
      setTrackingLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [localDate])

  const completionByMealId = useMemo(() => {
    const map = new Map<string, DailyTrackingSummary['meals'][number]>()
    dailyTracking?.meals.forEach(m => map.set(m.mealId, m))
    return map
  }, [dailyTracking])

  const isPersistedMealId = (id: string) => initialMeals.some(m => m.id === id)

  // "Next meal" = the first persisted meal (in plan order) that isn't fully
  // eaten yet. Deliberately order-based rather than clock-based: meal times
  // are only ever a free-text suffix a user may type into the meal name
  // (see AddMealModal), not structured data this can reliably parse.
  const nextMeal = useMemo(() => {
    return draft.find(m => (completionByMealId.get(m.id)?.status ?? 'none') !== 'complete') ?? null
  }, [draft, completionByMealId])

  const scrollToMeal = (mealId: string) => {
    const el = document.getElementById(`meal-${mealId}`)
    if (!el) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  // Meal-level click: incomplete/partial -> mark every food in the meal
  // completed; already complete -> mark every food incomplete.
  const handleToggleMealCompletion = async (mealId: string) => {
    const currentStatus = completionByMealId.get(mealId)?.status ?? 'none'
    const nextCompleted = currentStatus !== 'complete'
    setTogglingMealId(mealId)
    setTrackingError(null)
    const result = await toggleMealCompletion(mealId, localDate, nextCompleted)
    if ('error' in result) setTrackingError(result.error)
    else setDailyTracking(result.data)
    setTogglingMealId(null)
  }

  const handleToggleFoodCompletion = async (foodId: string, mealId: string) => {
    const meal = completionByMealId.get(mealId)
    const currentlyCompleted = meal?.foods.find(f => f.foodId === foodId)?.completed ?? false
    setTogglingFoodId(foodId)
    setTrackingError(null)
    const result = await toggleFoodCompletion(foodId, mealId, localDate, !currentlyCompleted)
    if ('error' in result) setTrackingError(result.error)
    else setDailyTracking(result.data)
    setTogglingFoodId(null)
  }

  const foodOptionsById = useMemo(() => {
    const map = new Map<string, FoodOption>()
    for (const f of foodOptions) map.set(f.id, f)
    return map
  }, [foodOptions])

  const changes = useMemo(() => diffMeals(initialMeals, draft), [initialMeals, draft])
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
      {/* Section 1 - Today's Nutrition: consumed vs. target, strongest
          visual weight, answers "how am I doing today?" at a glance. */}
      {trackingLoading ? (
        <div className="space-y-4" aria-hidden="true">
          <div className="h-40 rounded-xl bg-surface border border-border animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-xl bg-surface border border-border animate-pulse" />
            ))}
          </div>
        </div>
      ) : trackingError ? (
        <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-lg">
          <AlertIcon size={18} className="shrink-0 mt-0.5" />
          <span>{trackingError}</span>
        </div>
      ) : (
        <>
          <MacroSummaryCards totals={dailyTracking!.consumed} targets={targets} />
          {/* Section 2 - Today's Progress: meal/food completion counts +
              macro percentages, condensed to a 2-3-second scan. */}
          <DailyProgressSummary tracking={dailyTracking!} />
        </>
      )}

      <div className="flex justify-end">
        <Link
          href="/dashboard/insights"
          className="min-h-[44px] inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
        >
          Weekly &amp; Monthly Insights
          <ChevronRightIcon size={14} />
        </Link>
      </div>

      {/* Section 6 - Next Meal: read-only spotlight on what to focus on
          next, jumps to the matching card below rather than duplicating
          its editable content. */}
      {nextMeal && (
        <NextMealSpotlight meal={nextMeal} onView={() => scrollToMeal(nextMeal.id)} />
      )}

      {/* Section 3 - Today's Meals: the primary actionable area, answers
          "what should I eat?". Each card's checkbox answers "did I eat
          this?" - a separate concern from planning/editing below it. */}
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
              isNext={nextMeal?.id === meal.id}
              onQuantityChange={(foodId, qty) => handleQuantityChange(meal.id, foodId, qty)}
              onRemoveFood={(foodId) => handleRemoveFood(meal.id, foodId)}
              onAddFood={(dbFoodId, qty) => handleAddFood(meal.id, dbFoodId, qty)}
              onMoveFood={(foodId, toMealId) => handleMoveFood(foodId, meal.id, toMealId)}
              onFoodCreated={handleFoodCreated}
              completion={
                isPersistedMealId(meal.id)
                  ? {
                      status: completionByMealId.get(meal.id)?.status ?? 'none',
                      completedFoodIds: new Set(
                        (completionByMealId.get(meal.id)?.foods ?? [])
                          .filter(f => f.completed)
                          .map(f => f.foodId)
                      ),
                      onToggleMeal: () => handleToggleMealCompletion(meal.id),
                      onToggleFood: (foodId) => handleToggleFoodCompletion(foodId, meal.id),
                      togglingMeal: togglingMealId === meal.id,
                      togglingFoodId
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* Section 9 - Change Summary: visually secondary, answers "what did
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
