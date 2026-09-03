'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import { diffMeals, moveFood, computeDailyTotals, uniqueMealName, type DraftMeal, type DraftFood } from '@/lib/diet/diff'
import { saveDietPlan } from '../actions'
import {
  getTodayTracking,
  logFoodConsumption,
  type FoodTrackingState,
  type DailyTrackingSummary
} from '../tracking-actions'
import { useLocalDate } from '@/lib/tracking/useLocalDate'
import {
  initState,
  viewOf,
  savingFoodIdsOf,
  requestFoodLog,
  requestMealToggle,
  settleFoodLog,
  type OptimisticState,
  type Effect,
  type FoodIntent
} from '@/lib/tracking/optimisticTracking'
import type { SaveDietPlanPayload } from '@/lib/diet/save-plan'
import MealCard from './MealCard'
import AddMealModal from './AddMealModal'
import ChangeSummaryPanel from './ChangeSummaryPanel'
import DailyProgress from './DailyProgress'

import NextMealSpotlight from './NextMealSpotlight'
import ReminderStatusBar from './ReminderStatusBar'


import Button from '@/components/ui/Button'
import { PlusIcon, AlertIcon, ChevronRightIcon } from '@/components/ui/icons'
import { getReminderSchedule, type NotificationPreferencesDTO, type ReminderMealDTO } from '@/lib/notifications/actions'
import { useMealReminders } from '@/lib/notifications/useMealReminders'

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesDTO = {
  remindersEnabled: false,
  milestonesEnabled: true,
  timezone: null
}

// Stable identity for "nothing is saving" so the memo below doesn't hand a
// fresh Set to every MealCard on every render.
const EMPTY_SAVING_SET: ReadonlySet<string> = new Set()

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

export default function DietEditor({
  initialMeals,
  targets,
  foodOptions: initialFoodOptions
}: Props) {
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
  // useLocalDate (not a frozen useState lazy initializer) - stays correct
  // across a session left open past midnight; the effect below already
  // re-fetches whenever this value changes.
  const localDate = useLocalDate()
  // A ref so an in-flight persist that resolves after a midnight rollover can
  // tell its result is for the previous day and drop it. Kept in sync via an
  // effect (never written during render).
  const localDateRef = useRef(localDate)
  useEffect(() => {
    localDateRef.current = localDate
  }, [localDate])

  // `optState` holds BOTH the last server-confirmed tracking snapshot AND any
  // optimistic changes the server has not acknowledged yet - see
  // lib/tracking/optimisticTracking.ts. The meal UI renders viewOf(optState)
  // so a click shows instantly; notifications keep reading the confirmed
  // snapshot only, so their timing is unchanged. `optStateRef` mirrors it so
  // background-persist callbacks act on the latest state without going stale.
  const [optState, setOptState] = useState<OptimisticState | null>(null)
  const optStateRef = useRef<OptimisticState | null>(null)
  const [trackingLoading, setTrackingLoading] = useState(true)
  const [trackingError, setTrackingError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTodayTracking(localDate).then(result => {
      if (cancelled) return
      if ('error' in result) {
        setTrackingError(result.error)
      } else {
        const next = initState(result.data)
        optStateRef.current = next
        setOptState(next)
      }
      setTrackingLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [localDate])

  // Meal reminders/milestones - a separate concern from both the planning
  // draft and the tracking fetch above, fetched once on mount. Reminder
  // scheduling/dedup/copy logic all lives in lib/notifications/; this
  // component only holds the fetched state and renders the status bar.
  const [reminderMeals, setReminderMeals] = useState<ReminderMealDTO[]>([])
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferencesDTO>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )

  useEffect(() => {
    let cancelled = false
    getReminderSchedule().then(result => {
      if (cancelled) return
      if ('data' in result) {
        setReminderMeals(result.data.meals)
        setNotificationPreferences(result.data.preferences)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Notifications read the server-CONFIRMED snapshot, never the optimistic
  // overlay - a reminder/milestone must only fire off state that is actually
  // persisted. `optState.confirmed` keeps a stable identity across
  // optimistic-only churn, so this effect still only re-runs when the server
  // truly advances the confirmed state (same cadence as before this change).
  useMealReminders(reminderMeals, notificationPreferences, optState?.confirmed ?? null, localDate)

  // Everything the meal UI renders comes from this optimistic view: the
  // confirmed snapshot with any un-acknowledged clicks folded on top.
  const dailyTracking = useMemo(() => (optState ? viewOf(optState) : null), [optState])
  const savingFoodIds = useMemo(
    () => (optState ? savingFoodIdsOf(optState) : EMPTY_SAVING_SET),
    [optState]
  )

  const completionByMealId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof dailyTracking>['meals'][number]>()
    dailyTracking?.meals.forEach(m => map.set(m.mealId, m))
    return map
  }, [dailyTracking])

  const isPersistedMealId = (id: string) => initialMeals.some(m => m.id === id)
  // Same idea, for foods - a food's id is only "real" (safe to send back to
  // the server as SaveDietPlanFood.currentId, for finalize_plan_swap's
  // relink mapping) if it already existed in the last-loaded/last-saved
  // tree; a client-only "new-food-*" placeholder id never is.
  const isPersistedFoodId = (id: string) => initialMeals.some(m => m.foods.some(f => f.id === id))

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

  // Runs one pure transition against the live optState and then executes the
  // Effects it asks for. Effects are handled HERE, outside any React updater,
  // so a StrictMode double-invoke can never fire a persist twice.
  const applyTracking = (
    transition: (s: OptimisticState) => { state: OptimisticState; effects: Effect[] }
  ) => {
    const current = optStateRef.current
    if (!current) return
    const { state, effects } = transition(current)
    optStateRef.current = state
    setOptState(state)
    for (const effect of effects) {
      if (effect.type === 'error') setTrackingError(effect.message)
      else void persistFoodLog(effect.foodId, effect.intent)
    }
  }

  // The background half of the optimistic update: the UI has already moved;
  // this persists to Supabase through the UNCHANGED server action (same RLS,
  // same user/date/meal ownership checks, same idempotent upsert) and feeds
  // the result back so the change is either confirmed or rolled back.
  const persistFoodLog = async (foodId: string, intent: FoodIntent) => {
    const dispatchDate = localDateRef.current
    setTrackingError(null)
    let result: { data: DailyTrackingSummary } | { error: string }
    try {
      result = await logFoodConsumption(foodId, intent.mealId, dispatchDate, intent.consumedQuantity)
    } catch {
      result = { error: 'Something went wrong while saving. Please try again.' }
    }
    // A midnight rollover happened while this was in flight - the result is
    // for the previous day; the new day already re-fetched from scratch.
    if (localDateRef.current !== dispatchDate) return
    applyTracking(s => settleFoodLog(s, foodId, result))
  }

  // Meal-level click: incomplete/partial -> mark every food in the meal
  // eaten; already complete -> mark every food not-eaten. Fans out over the
  // meal's foods through the same per-food path so serialization and
  // rollback are identical to a direct food click.
  const handleToggleMealCompletion = (mealId: string) => {
    const currentStatus = completionByMealId.get(mealId)?.status ?? 'none'
    applyTracking(s => requestMealToggle(s, mealId, currentStatus !== 'complete'))
  }

  const handleLogFoodConsumption = (foodId: string, mealId: string, consumedQuantity: number) => {
    applyTracking(s => requestFoodLog(s, foodId, { mealId, consumedQuantity }))
  }

  const foodOptionsById = useMemo(() => {
    const map = new Map<string, FoodOption>()
    for (const f of foodOptions) map.set(f.id, f)
    return map
  }, [foodOptions])

  const changes = useMemo(() => diffMeals(initialMeals, draft), [initialMeals, draft])
  const hasChanges = changes.length > 0

  const dailyTotals = useMemo(() => computeDailyTotals(draft), [draft])

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

  const handleUpdateFoodQuantity = (mealId: string, foodId: string, quantity: number) => {
    commit(current => current.map(meal => {
      if (meal.id !== mealId) return meal
      return {
        ...meal,
        foods: meal.foods.map(food => {
          if (food.id !== foodId) return food
          if (!food.foodDatabaseId) return food // locked food, cannot update macros

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
    commit(current => moveFood(current, sourceMealId, foodId, targetMealId))
  }

  const handleAddMeal = (name: string) => {
    const newMeal: DraftMeal = {
      id: nextTempId('new-meal'),
      name: uniqueMealName(draft.map(m => m.name), name),
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
        currentId: isPersistedMealId(meal.id) ? meal.id : null,
        foods: meal.foods.map(food => ({
          foodDatabaseId: food.foodDatabaseId,
          originalFoodId: food.foodDatabaseId ? null : food.id,
          quantity: food.quantity,
          unit: food.unit,
          // A locked item's id (no foodDatabaseId) is always the real,
          // already-persisted foods.id - only an editable item can be a
          // brand-new, not-yet-saved client placeholder.
          currentId: food.foodDatabaseId ? (isPersistedFoodId(food.id) ? food.id : null) : food.id
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
      <ReminderStatusBar preferences={notificationPreferences} onPreferencesChange={setNotificationPreferences} />

      {/* Section 1 - Today's Actual Progress: the ONE daily section, sourced
          strictly from actually-logged consumption (dailyTracking.consumed),
          never from the planned diet total. Answers "how much of my daily
          target have I actually consumed today?" without repeating the same
          percentages in a second card set below it. */}
      {trackingLoading || (!trackingError && !dailyTracking) ? (
        <div className="space-y-4" aria-hidden="true">
          <div className="h-40 rounded-card bg-surface border border-border animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-card bg-surface border border-border animate-pulse" />
            ))}
          </div>
        </div>
      ) : trackingError ? (
        <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
          <AlertIcon size={18} className="shrink-0 mt-0.5" />
          <span>{trackingError}</span>
        </div>
      ) : (
        <>
          <DailyProgress tracking={dailyTracking!} targets={targets} />


        </>
      )}

      <div className="flex justify-end">
        <Link
          href="/dashboard/insights"
          className="min-h-[44px] inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
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
              changes={changes}
              foodOptions={foodOptions}
              isNext={nextMeal?.id === meal.id}
              onRemoveFood={(foodId) => handleRemoveFood(meal.id, foodId)}
              onAddFood={(dbFoodId, qty) => handleAddFood(meal.id, dbFoodId, qty)}
              onUpdateFoodQuantity={(foodId, qty) => handleUpdateFoodQuantity(meal.id, foodId, qty)}
              onMoveFood={(foodId, targetMealId) => handleMoveFood(meal.id, foodId, targetMealId)}
              otherMeals={draft.filter(m => m.id !== meal.id).map(m => ({ id: m.id, name: m.name }))}
              onFoodCreated={handleFoodCreated}
              dailyTargets={targets}
              dailyTotals={dailyTotals}
              completion={
                isPersistedMealId(meal.id) && completionByMealId.get(meal.id)
                  ? {
                      status: completionByMealId.get(meal.id)!.status,
                      planned: completionByMealId.get(meal.id)!.planned,
                      actual: completionByMealId.get(meal.id)!.actual,
                      foods: new Map<string, FoodTrackingState>(
                        completionByMealId.get(meal.id)!.foods.map(f => [f.foodId, f])
                      ),
                      onToggleMeal: () => handleToggleMealCompletion(meal.id),
                      onLogFood: (foodId, consumedQuantity) => handleLogFoodConsumption(foodId, meal.id, consumedQuantity),
                      // A meal-level saving hint that never blocks: true while
                      // any food in this meal has an unsaved change in flight.
                      togglingMeal: completionByMealId
                        .get(meal.id)!
                        .foods.some(f => savingFoodIds.has(f.foodId)),
                      savingFoodIds
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
