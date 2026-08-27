'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitOnboarding } from './actions'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FoodStep from './FoodStep'
import GeneratingPanel from './GeneratingPanel'
import ProfileStep, {
  emptyProfileFormValue,
  isProfileFormComplete,
  weightInKg,
  heightInCm,
  type ProfileFormValue
} from './ProfileStep'
import GoalStep from './GoalStep'
import RemindersStep, { type RemindersFormValue } from './RemindersStep'
import TrainingNutritionStep, {
  emptyTrainingNutritionFormValue,
  isTrainingNutritionFormComplete,
  type TrainingNutritionFormValue
} from './TrainingNutritionStep'
import NutritionCreationChoice from './NutritionCreationChoice'
import DailyTargetsStep from './DailyTargetsStep'
import ManualMealBuilderStep, { type ManualFoodOption } from './ManualMealBuilderStep'
import FinalReviewStep from './FinalReviewStep'
import { createManualDietPlan, saveMealReminders, ensureManualSupplementFoods, type CreatedMeal } from './manual-actions'
import { AlertIcon, ChevronDownIcon } from '@/components/ui/icons'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'
import { buildNutritionTarget, validateNutritionTarget, validateMacroValues, type ActivityLevel, type Goal, type NutritionTarget } from '@/lib/nutrition/engine'
import { defaultReminderTimes } from '@/lib/notifications/schedule'
import { defaultMealNamesForCount, type DraftMeal } from '@/lib/diet/diff'
import type { SaveDietPlanPayload } from '@/lib/diet/save-plan'
import type { UserProfile } from '@/lib/types'

// Onboarding is 8 steps deep and collects real effort (biometrics, macro
// targets, food selections, training setup) before the final "Generate Meal
// Plan" submit - losing all of it to an accidental refresh or closed tab is
// a real, previously-unmitigated data-loss risk. Persisted to localStorage
// only (never sent anywhere), and only body-metric/preference data the user
// is already actively typing into this form - nothing more sensitive is
// added. Cleared the moment generation succeeds (see handleSubmit below).
const ONBOARDING_DRAFT_KEY = 'gym-meals-onboarding-draft-v1'

interface OnboardingDraft {
  step: number
  profile: ProfileFormValue
  goal: Goal | ''
  calculatorSkipped: boolean
  nutritionTarget: NutritionTarget | null
  targetsSource: 'recommended' | 'custom'
  calories: string
  protein: string
  carbs: string
  fat: string
  meals: string
  reminders: RemindersFormValue
  trainingNutrition: TrainingNutritionFormValue
  selectedProteins: string[]
  selectedCarbs: string[]
  selectedFats: string[]
  // 'ai' is never actually reachable through the UI (see
  // NutritionCreationChoice) - kept in the type only so the dead AI-path
  // JSX/handleNext branches below still type-check against a real value.
  path: 'manual' | 'ai' | null
  manualMeals: DraftMeal[]
  // Only meaningful once step 8 (Create Plan) has already succeeded - see
  // the createdMeals state comment below. Persisted so a refresh mid-step-9
  // (plan saved, reminders not yet configured) doesn't strand the user on a
  // Reminders step with no meals to address.
  createdMeals: CreatedMeal[]
  manualReminders: RemindersFormValue
}

function loadOnboardingDraft(): OnboardingDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ONBOARDING_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as OnboardingDraft) : null
  } catch {
    return null
  }
}

function clearOnboardingDraft() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_KEY)
  } catch {
    // Storage unavailable (private browsing, quota) - nothing to clean up.
  }
}

type Food = {
  id: string
  name: string
  category: string
}

type InitialMealReminder = { time: string | null; enabled: boolean }

type Props = {
  foods: Food[]
  isNewPlanFlow?: boolean
  // Pre-fills the Profile/Goal steps from the user's saved profile row (and
  // their current plan's goal, if any) so the regenerate-plan flow
  // (?newPlan=true) reopens with last-saved values instead of blank -
  // that's what makes "change goal later" just re-running this wizard.
  initialProfile?: Partial<UserProfile> | null
  initialGoal?: Goal | null
  // Same idea for the Reminders step: prefills from the user's saved
  // notification_preferences row and (on the regenerate-plan flow only)
  // their previous active plan's per-meal reminder settings, by position.
  initialRemindersEnabled?: boolean | null
  initialMealReminders?: InitialMealReminder[] | null
  // The manual builder's searchable food library - additive alongside
  // `foods` above (which continues to feed the untouched, unreachable AI
  // steps only). Includes supplement rows, unlike `foods`.
  manualFoodOptions?: ManualFoodOption[]
}

// Base steps every path shares (About You / Goal / Targets), plus the
// choice screen itself - the array is genuinely only this long until the
// user actually picks a path, since the manual builder's own step count
// (Training/Targets recap/Build Meals/Review/Reminders) has nothing to
// project forward before that choice is made. See STEP_LABELS below, which
// extends this once `path === 'manual'`.
const BASE_STEP_LABELS = ['About You', 'Goal', 'Targets', 'Create Plan']
const MANUAL_STEP_LABELS = ['Training', 'Your Targets', 'Build Meals', 'Review', 'Reminders']

const GOAL_LABELS: Record<Goal, string> = {
  cut: 'Cut',
  recomp: 'Recomp',
  lean_bulk: 'Lean Bulk',
  maintain: 'Maintain'
}

// Non-blocking sanity check only - protein/carbs/fat grams don't have to add
// up exactly to the calorie target (users round, and that's fine), but a
// large mismatch is worth surfacing before generation runs.
const CALORIE_MISMATCH_TOLERANCE = 0.1

function profileFormFromUserProfile(p?: Partial<UserProfile> | null): ProfileFormValue {
  const base = emptyProfileFormValue()
  if (!p) return base
  return {
    ...base,
    sex: p.sex ?? '',
    age: p.age != null ? String(p.age) : '',
    weightUnit: 'kg',
    weightInput: p.weight_kg != null ? String(p.weight_kg) : '',
    heightCm: p.height_cm != null ? String(p.height_cm) : '',
    activityLevel: p.activity_level ?? '',
    // Derived straight from the existing training_days_per_week column -
    // 0 -> 'no', >0 -> 'yes', null/undefined -> '' (unanswered, exactly
    // today's first-time-user state). No new DB field needed.
    doesTrain: p.training_days_per_week == null ? '' : p.training_days_per_week > 0 ? 'yes' : 'no',
    trainingDaysPerWeek: p.training_days_per_week != null ? String(p.training_days_per_week) : '',
    bodyFatPercent: p.body_fat_percent != null ? String(p.body_fat_percent) : '',
    averageDailySteps: p.average_daily_steps != null ? String(p.average_daily_steps) : '',
    currentCalorieIntake: p.current_calorie_intake != null ? String(p.current_calorie_intake) : ''
  }
}

function trainingNutritionFromUserProfile(p?: Partial<UserProfile> | null): TrainingNutritionFormValue {
  const base = emptyTrainingNutritionFormValue()
  if (!p) return base
  
  let initialSupplements = p.supplements || []
  
  // Backward compatibility: If no supplements array exists but legacy columns are set,
  // migrate them into the initial state.
  if (initialSupplements.length === 0 && p.uses_supplements && p.supplement_type) {
    initialSupplements = [{
      type: p.supplement_type,
      brand: p.protein_brand || undefined,
      serving_label: p.protein_serving_label || '',
      amount_per_serving_g: p.protein_per_serving_g || undefined
    }]
  }

  return {
    ...base,
    trainingTime: p.training_time ?? '',
    trainingTimeCustom: p.training_time_custom ?? '',
    supplements: initialSupplements
  }
}

// Seeds the temp-id counter (see nextTempId below) past whatever numeric
// suffixes already exist in a reloaded draft's manualMeals - a fresh
// component mount (e.g. a page reload) would otherwise restart the counter
// at 0 and generate an id that collides with one already sitting in the
// restored draft.
function computeInitialIdCounter(meals: DraftMeal[]): number {
  let max = -1
  const idPattern = /-(\d+)$/
  for (const meal of meals) {
    const mealMatch = idPattern.exec(meal.id)
    if (mealMatch) max = Math.max(max, parseInt(mealMatch[1], 10))
    for (const food of meal.foods) {
      const foodMatch = idPattern.exec(food.id)
      if (foodMatch) max = Math.max(max, parseInt(foodMatch[1], 10))
    }
  }
  return max + 1
}

function formatRate(target: NutritionTarget): string {
  if (target.targetWeeklyRatePercent === 0) return 'Aim for an approximately stable bodyweight'
  const direction = target.targetWeeklyRatePercent < 0 ? 'loss' : 'gain'
  return `~${Math.abs(target.targetWeeklyRatePercent)}% bodyweight/week ${direction}`
}

export default function OnboardingForm({
  foods,
  isNewPlanFlow = false,
  initialProfile = null,
  initialGoal = null,
  initialRemindersEnabled = null,
  initialMealReminders = null,
  manualFoodOptions = []
}: Props) {
  // Local copy of the server-fetched catalog so a custom food created via
  // FoodStep's "Add Custom Food" appears (and can be selected) immediately,
  // without a page reload. It's still the same food_database row underneath
  // (createFoodDatabaseEntry persists it for real) - this is purely a UI
  // mirror of that table, kept in sync on each creation.
  const [foodList, setFoodList] = useState<Food[]>(foods)

  // Computed once, synchronously, on mount - a leftover draft from a
  // previous incomplete session (refresh, closed tab) takes priority over
  // the server-provided initial* props so the user resumes exactly where
  // they left off.
  const [draft] = useState<OnboardingDraft | null>(() => loadOnboardingDraft())

  const PROTEINS = useMemo(
    () => foodList.filter(f => ['protein', 'dairy'].includes((f.category || '').toLowerCase().trim())),
    [foodList]
  )
  const CARBS = useMemo(
    () => foodList.filter(f => ['carbohydrate', 'fruit'].includes((f.category || '').toLowerCase().trim())),
    [foodList]
  )
  const FATS = useMemo(
    () => foodList.filter(f => ['fat'].includes((f.category || '').toLowerCase().trim())),
    [foodList]
  )

  const addFoodToList = (food: FoodOption) => {
    setFoodList(prev =>
      prev.some(f => f.id === food.id) ? prev : [...prev, { id: food.id, name: food.name, category: food.category }]
    )
  }

  // Auto-selects a newly-created food only when it actually landed in the
  // category the user was browsing (they can pick any category in the
  // create form) - otherwise it's still saved and will show up correctly
  // under its real category's step, just not force-selected here.
  const handleFoodCreatedFor = (categories: string[], selectedIds: string[], setSelectedIds: (ids: string[]) => void) => (food: FoodOption) => {
    addFoodToList(food)
    if (categories.includes(food.category) && !selectedIds.includes(food.id)) {
      setSelectedIds([...selectedIds, food.id])
    }
  }

  const router = useRouter()
  const [step, setStep] = useState(draft?.step ?? 1)
  // 'idle' is the wizard itself; the other three phases render
  // GeneratingPanel. Kept as one state machine (rather than separate
  // loading/generationFailed booleans) so "generating", "succeeded", and
  // "threw" are mutually exclusive by construction - there's no combination
  // of flags that could show the error screen while a request that's about
  // to succeed is still in flight.
  const [phase, setPhase] = useState<'idle' | 'generating' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  // Remounts GeneratingPanel on each attempt so its stage timer resets
  // cleanly on retry, instead of resetting state imperatively in an effect.
  const [attempt, setAttempt] = useState(0)

  // Nutrition Engine state (Profile -> Goal -> calculated Targets). A user
  // who hits "Skip" on the Profile step never populates `nutritionTarget`,
  // and the Targets step renders exactly as it always has - the calculator
  // is purely additive on top of the existing manual-entry flow.
  const [profile, setProfile] = useState<ProfileFormValue>(() => draft?.profile ?? profileFormFromUserProfile(initialProfile))
  const [goal, setGoal] = useState<Goal | ''>(draft?.goal ?? (initialGoal ?? ''))
  const [calculatorSkipped, setCalculatorSkipped] = useState(draft?.calculatorSkipped ?? false)
  const [nutritionTarget, setNutritionTarget] = useState<NutritionTarget | null>(draft?.nutritionTarget ?? null)
  const [targetsSource, setTargetsSource] = useState<'recommended' | 'custom'>(draft?.targetsSource ?? 'custom')
  const calculatorUsed = !calculatorSkipped && nutritionTarget !== null

  // Form State
  const [calories, setCalories] = useState(draft?.calories ?? '2250')
  const [protein, setProtein] = useState(draft?.protein ?? '150')
  const [carbs, setCarbs] = useState(draft?.carbs ?? '250')
  const [fat, setFat] = useState(draft?.fat ?? '70')
  const [meals, setMeals] = useState(draft?.meals ?? '4')

  // Reminders step state - collected by POSITION (see RemindersStep's
  // comment) since the real meal names don't exist until after generation.
  // Resizes to follow the "Meals Per Day" select (step 3) so going back and
  // changing meal count never leaves this out of sync, preserving whatever
  // the user already configured for positions that still exist.
  const [reminders, setReminders] = useState<RemindersFormValue>(() => {
    if (draft?.reminders) return draft.reminders
    const count = parseInt(meals) || 0
    const defaults = defaultReminderTimes(count)
    return {
      enabled: initialRemindersEnabled ?? false,
      perMeal: Array.from({ length: count }, (_, i) => ({
        time: initialMealReminders?.[i]?.time ?? defaults[i],
        enabled: initialMealReminders?.[i]?.enabled ?? true
      }))
    }
  })

  // Resizes reminders.perMeal to follow the "Meals Per Day" select without an
  // effect - React's documented pattern for "adjust state when a prop/other
  // state changes" (react.dev/learn/you-might-not-need-an-effect), tracking
  // the count seen last render and updating both states in the same pass if
  // it changed, rather than a setState-in-effect extra render round-trip.
  const [lastSyncedMealsCount, setLastSyncedMealsCount] = useState(() => parseInt(meals) || 0)
  const mealsCount = parseInt(meals) || 0
  if (mealsCount !== lastSyncedMealsCount) {
    const defaults = defaultReminderTimes(mealsCount)
    setLastSyncedMealsCount(mealsCount)
    setReminders(prev => ({
      ...prev,
      perMeal: Array.from({ length: mealsCount }, (_, i) => prev.perMeal[i] ?? {
        time: initialMealReminders?.[i]?.time ?? defaults[i],
        enabled: initialMealReminders?.[i]?.enabled ?? true
      })
    }))
  }

  const [trainingNutrition, setTrainingNutrition] = useState<TrainingNutritionFormValue>(() =>
    draft?.trainingNutrition ?? trainingNutritionFromUserProfile(initialProfile)
  )

  const [selectedProteins, setSelectedProteins] = useState<string[]>(draft?.selectedProteins ?? [])
  const [selectedCarbs, setSelectedCarbs] = useState<string[]>(draft?.selectedCarbs ?? [])
  const [selectedFats, setSelectedFats] = useState<string[]>(draft?.selectedFats ?? [])

  // Manual-path state (Nutrition Creation Choice onward). `path` is typed to
  // also allow 'ai' purely so the old, permanently-unreachable AI-path JSX/
  // handleNext branches below still type-check - NutritionCreationChoice's
  // onChange can only ever produce 'manual'.
  const [path, setPath] = useState<'manual' | 'ai' | null>(draft?.path ?? null)
  const [manualMeals, setManualMeals] = useState<DraftMeal[]>(draft?.manualMeals ?? [])

  // See BASE_STEP_LABELS/MANUAL_STEP_LABELS above - the manual path's own
  // steps only ever get projected into the progress bar/step count once
  // they're actually reachable (path === 'manual').
  const STEP_LABELS = useMemo(
    () => (path === 'manual' ? [...BASE_STEP_LABELS, ...MANUAL_STEP_LABELS] : BASE_STEP_LABELS),
    [path]
  )
  const TOTAL_STEPS = STEP_LABELS.length

  // Local copy of the server-fetched manual food library, kept in sync with
  // any food created via the builder's "Add a new food" form this session -
  // same pattern as `foodList`/`addFoodToList` above, for the manual path's
  // own (separate) food set.
  const [manualFoodOptionsList, setManualFoodOptionsList] = useState<ManualFoodOption[]>(manualFoodOptions)
  const handleManualFoodCreated = (food: FoodOption) => {
    setManualFoodOptionsList(prev => (prev.some(f => f.id === food.id) ? prev : [...prev, food as ManualFoodOption]))
  }

  // Shared, prefix-agnostic counter for every client-side temp id the
  // manual builder creates (new meals, new foods) - seeded past whatever a
  // reloaded draft already contains (see computeInitialIdCounter) so a page
  // reload can never generate an id that collides with one already in the
  // restored manualMeals.
  const idCounterRef = useRef(computeInitialIdCounter(draft?.manualMeals ?? []))
  const nextTempId = (prefix: string) => `${prefix}-${idCounterRef.current++}`

  // Selecting "Create My Own Plan" seeds three empty default meals, exactly
  // once - re-selecting after navigating back and forth must never wipe out
  // meals the user already built.
  const handleSelectManualPath = () => {
    setPath('manual')
    if (manualMeals.length === 0) {
      // Follows the "Meals Per Day" selector chosen back on the shared
      // Daily Targets step (previously ignored entirely here - always 3
      // fixed meals regardless of what was selected).
      setManualMeals(
        defaultMealNamesForCount(mealsCount).map((name, i) => ({
          id: nextTempId('new-meal'),
          name,
          sortOrder: i,
          foods: []
        }))
      )
    }
  }

  // Populated once createManualDietPlan (step 8) succeeds - the plan is
  // already fully saved at that point, and step 9 (Meal Reminders)
  // configures reminders directly against these real, persisted meal ids
  // (no name/position matching needed, unlike the AI path's `reminders`
  // state above).
  const [createdMeals, setCreatedMeals] = useState<CreatedMeal[]>(draft?.createdMeals ?? [])
  const [manualReminders, setManualReminders] = useState<RemindersFormValue>(
    draft?.manualReminders ?? { enabled: false, perMeal: [] }
  )
  const [savingReminders, setSavingReminders] = useState(false)
  const [savingSupplementFoods, setSavingSupplementFoods] = useState(false)
  // Ref, not state - see handleManualSubmit's own comment for why a
  // synchronous re-entrancy guard is needed instead of (or in addition to)
  // the phase-based render swap.
  const submittingManualPlanRef = useRef(false)

  // Persist the draft on every relevant change so a refresh/closed tab can
  // resume - but not while a generation attempt's result screen is showing
  // (phase !== 'idle'), and never once generation has actually succeeded
  // (cleared explicitly in handleSubmit's success branch below).
  useEffect(() => {
    if (phase !== 'idle') return
    const toSave: OnboardingDraft = {
      step,
      profile,
      goal,
      calculatorSkipped,
      nutritionTarget,
      targetsSource,
      calories,
      protein,
      carbs,
      fat,
      meals,
      reminders,
      trainingNutrition,
      selectedProteins,
      selectedCarbs,
      selectedFats,
      path,
      manualMeals,
      createdMeals,
      manualReminders
    }
    try {
      window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(toSave))
    } catch {
      // Best-effort - storage unavailable or full. The user's current
      // session is unaffected either way.
    }
  }, [
    step,
    profile,
    goal,
    calculatorSkipped,
    nutritionTarget,
    targetsSource,
    calories,
    protein,
    carbs,
    fat,
    meals,
    reminders,
    trainingNutrition,
    selectedProteins,
    selectedCarbs,
    selectedFats,
    path,
    manualMeals,
    createdMeals,
    manualReminders,
    phase
  ])

  const toggleSelection = (id: string, current: string[], setter: (val: string[]) => void) => {
    if (current.includes(id)) {
      setter(current.filter(item => item !== id))
    } else {
      setter([...current, id])
    }
  }

  // Wraps the four target-field setters so any direct edit flips
  // targetsSource to 'custom' - this is the "preserve manual edits"
  // guarantee: once a user touches a number, the engine never silently
  // overwrites it again on this visit to the step.
  const editTargetField = (setter: (val: string) => void) => (val: string) => {
    setter(val)
    if (nutritionTarget) setTargetsSource('custom')
  }

  const handleSkipProfile = () => {
    setError(null)
    setCalculatorSkipped(true)
    setStep(3)
  }

  const handleBack = () => {
    setError(null)
    // A user who skipped the calculator never saw the Goal step - going
    // back from Targets should return them to Profile, not to a Goal step
    // they never visited.
    if (step === 3 && calculatorSkipped) {
      setStep(1)
      return
    }
    setStep(prev => prev - 1)
  }

  const handleNext = async () => {
    setError(null)

    if (step === 1) {
      if (!isProfileFormComplete(profile)) {
        setError('Please fill in your sex, age, weight, height, activity level, and training days.')
        return
      }
      setCalculatorSkipped(false)
      setStep(2)
      return
    }

    if (step === 2) {
      if (!goal) {
        setError('Please choose a goal.')
        return
      }
      const weightKg = weightInKg(profile)
      if (weightKg === null) {
        setError('Please go back and enter a valid weight.')
        return
      }
      const heightCm = heightInCm(profile)
      if (heightCm === null) {
        setError('Please go back and enter your height in cm (e.g. 175).')
        return
      }
      const target = buildNutritionTarget({
        sex: profile.sex as 'male' | 'female',
        age: parseInt(profile.age),
        weightKg,
        heightCm,
        activityLevel: profile.activityLevel as ActivityLevel,
        trainingDaysPerWeek: parseInt(profile.trainingDaysPerWeek),
        goal,
        bodyFatPercent: profile.bodyFatPercent ? parseFloat(profile.bodyFatPercent) : null,
        averageDailySteps: profile.averageDailySteps ? parseInt(profile.averageDailySteps) : null,
        currentCalorieIntake: profile.currentCalorieIntake ? parseInt(profile.currentCalorieIntake) : null
      })
      // Defensive backstop on the calculator's own output (should always
      // reconcile given valid inputs - this exists to catch it if it ever
      // doesn't, per the spec's "never silently generate an extreme diet").
      const targetCheck = validateNutritionTarget(target)
      if (!targetCheck.valid) {
        setError(targetCheck.errors[0])
        return
      }
      setNutritionTarget(target)
      setTargetsSource('recommended')
      setCalories(String(target.calories))
      setProtein(String(target.protein))
      setCarbs(String(target.carbs))
      setFat(String(target.fat))
      setStep(3)
      return
    }

    if (step === 3) {
      // Was previously `if (!calories || !protein || !carbs || !fat)`, which
      // a negative number passes (`!(-500)` is false in JS) - letting a
      // negative target reach the server. validateMacroValues rejects
      // non-finite values and enforces calories/protein > 0, carbs/fat >= 0,
      // same rule the server independently re-checks in actions.ts.
      const macroCheck = validateMacroValues({
        calories: parseFloat(calories),
        protein: parseFloat(protein),
        carbs: parseFloat(carbs),
        fat: parseFloat(fat)
      })
      if (!macroCheck.valid) {
        setError(macroCheck.errors[0])
        return
      }
      setStep(4)
      return
    }

    if (step === 4) {
      // Dead code: path can never actually be 'ai' (see the path state
      // comment) - preserved only so this branch still exists for the
      // permanently-unreachable AI path per the "placeholder for future
      // development" requirement.
      if (path === 'ai') {
        if (selectedProteins.length === 0) {
          setError('Please select at least one protein source.')
          return
        }
        setStep(5)
        return
      }
      // Nutrition Creation Choice - only the manual path is selectable.
      if (path !== 'manual') {
        setError('Please choose how you want to build your plan.')
        return
      }
      setStep(5)
      return
    }

    if (step === 5) {
      if (path === 'ai') {
        if (selectedCarbs.length === 0) {
          setError('Please select at least one carbohydrate source.')
          return
        }
        setStep(6)
        return
      }
      // Training & Supplements (existing component/state, reused verbatim).
      if (!isTrainingNutritionFormComplete(trainingNutrition)) {
        setError('Please finish your training nutrition setup.')
        return
      }
      // Materializes a food_database row for each configured supplement
      // (create-or-reuse, same identity logic the AI path uses) BEFORE
      // advancing, so the Meal Builder step's food library already includes
      // it - without this call, a manually configured whey/creatine was
      // never turned into a usable food at all (see
      // ensureManualSupplementFoods's own comment).
      if (trainingNutrition.supplements.length > 0) {
        setSavingSupplementFoods(true)
        const result = await ensureManualSupplementFoods(trainingNutrition.supplements)
        setSavingSupplementFoods(false)
        if ('error' in result) {
          setError(result.error)
          return
        }
        for (const food of result.data) handleManualFoodCreated(food as unknown as FoodOption)
      }
      setStep(6)
      return
    }

    if (step === 6) {
      if (path === 'ai') {
        if (selectedFats.length === 0) {
          setError('Please select at least one fat source.')
          return
        }
        setStep(7)
        return
      }
      // Daily Targets recap - purely informational, no validation.
      setStep(7)
      return
    }

    if (step === 7) {
      if (path === 'ai') {
        if (!isTrainingNutritionFormComplete(trainingNutrition)) {
          setError('Please finish your training nutrition setup.')
          return
        }
        setStep(8)
        return
      }
      // Meal Builder - at least one food, anywhere, before Review.
      const hasFood = manualMeals.some(m => m.foods.length > 0)
      if (!hasFood) {
        setError('Please add at least one food to your meal plan before continuing.')
        return
      }
      setStep(8)
      return
    }
  }

  const handleSubmit = async () => {
    setError(null)
    setAttempt(prev => prev + 1)
    if (selectedFats.length === 0) {
      setError('Please select at least one fat source.')
      return
    }

    setPhase('generating')
    try {
      const formData = new FormData()
      formData.append('calories', calories)
      formData.append('protein', protein)
      formData.append('carbsTarget', carbs)
      formData.append('fat', fat)
      formData.append('meals', meals)
      formData.append('proteins', JSON.stringify(selectedProteins))
      formData.append('carbFoodIds', JSON.stringify(selectedCarbs))
      formData.append('fats', JSON.stringify(selectedFats))
      formData.append('newPlan', isNewPlanFlow ? 'true' : 'false')
      formData.append(
        'trainingNutrition',
        JSON.stringify({
          trainingTime: trainingNutrition.trainingTime || null,
          trainingTimeCustom: trainingNutrition.trainingTime === 'custom' ? trainingNutrition.trainingTimeCustom : null,
          supplements: trainingNutrition.supplements
        })
      )
      formData.append(
        'reminders',
        JSON.stringify({
          enabled: reminders.enabled,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          perMeal: reminders.perMeal
        })
      )

      if (calculatorUsed && nutritionTarget) {
        const weightKg = weightInKg(profile)
        formData.append(
          'nutritionProfile',
          JSON.stringify({
            sex: profile.sex,
            age: parseInt(profile.age),
            weightKg,
            heightCm: heightInCm(profile),
            activityLevel: profile.activityLevel,
            trainingDaysPerWeek: parseInt(profile.trainingDaysPerWeek),
            bodyFatPercent: profile.bodyFatPercent ? parseFloat(profile.bodyFatPercent) : null,
            averageDailySteps: profile.averageDailySteps ? parseInt(profile.averageDailySteps) : null,
            currentCalorieIntake: profile.currentCalorieIntake ? parseInt(profile.currentCalorieIntake) : null
          })
        )
        formData.append(
          'nutritionTargetMeta',
          JSON.stringify({
            goal: nutritionTarget.goal,
            targetsSource,
            estimatedMaintenanceCalories: nutritionTarget.estimatedMaintenanceCalories,
            calorieAdjustmentPercent: nutritionTarget.calorieAdjustmentPercent,
            proteinGramsPerKg: nutritionTarget.proteinGramsPerKg,
            fatGramsPerKg: nutritionTarget.fatGramsPerKg,
            targetWeeklyRatePercent: nutritionTarget.targetWeeklyRatePercent,
            calculationVersion: nutritionTarget.calculationVersion
          })
        )
      }

      // submitOnboarding never calls Next's redirect() (see actions.ts) - it
      // always resolves to a plain { error } or { success } object, so a
      // successful generation can never land in this catch block. Navigation
      // happens client-side, from handleContinue, only after the success
      // screen has had its moment.
      const result = await submitOnboarding(formData)
      if ('error' in result) {
        setError(result.error)
        setPhase('error')
      } else {
        clearOnboardingDraft()
        setPhase('success')
      }
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'Failed to generate meal plan.')
      setPhase('error')
    }
  }

  const handleManualSubmit = async () => {
    // Synchronous, ref-based re-entrancy guard - checked/set before React's
    // next render (which is what actually unmounts this button in favor of
    // GeneratingPanel) can happen, so a double-click here OR on
    // GeneratingPanel's "Try Again" retry button (which calls this same
    // function) can never both reach the server. The server-side
    // acquireManualPlanLock (lib/diet/manual-plan-lock.ts) is the real
    // correctness backstop regardless - this only avoids firing a second,
    // guaranteed-to-fail request and its confusing error message.
    if (submittingManualPlanRef.current) return
    submittingManualPlanRef.current = true

    setError(null)
    setAttempt(prev => prev + 1)
    const hasFood = manualMeals.some(m => m.foods.length > 0)
    if (!hasFood) {
      setError('Please add at least one food to your meal plan before continuing.')
      submittingManualPlanRef.current = false
      return
    }

    setPhase('generating')
    try {
      const payload: SaveDietPlanPayload = {
        meals: manualMeals.map(meal => ({
          name: meal.name,
          foods: meal.foods.map(food => ({
            foodDatabaseId: food.foodDatabaseId,
            originalFoodId: food.foodDatabaseId ? null : food.id,
            quantity: food.quantity,
            unit: food.unit
          }))
        }))
      }

      const nutritionProfilePayload =
        calculatorUsed && nutritionTarget
          ? {
              sex: profile.sex,
              age: parseInt(profile.age),
              weightKg: weightInKg(profile),
              heightCm: heightInCm(profile),
              activityLevel: profile.activityLevel,
              trainingDaysPerWeek: parseInt(profile.trainingDaysPerWeek),
              bodyFatPercent: profile.bodyFatPercent ? parseFloat(profile.bodyFatPercent) : null,
              averageDailySteps: profile.averageDailySteps ? parseInt(profile.averageDailySteps) : null,
              currentCalorieIntake: profile.currentCalorieIntake ? parseInt(profile.currentCalorieIntake) : null
            }
          : null

      const nutritionTargetMetaPayload =
        calculatorUsed && nutritionTarget
          ? {
              goal: nutritionTarget.goal,
              targetsSource,
              estimatedMaintenanceCalories: nutritionTarget.estimatedMaintenanceCalories,
              calorieAdjustmentPercent: nutritionTarget.calorieAdjustmentPercent,
              proteinGramsPerKg: nutritionTarget.proteinGramsPerKg,
              fatGramsPerKg: nutritionTarget.fatGramsPerKg,
              targetWeeklyRatePercent: nutritionTarget.targetWeeklyRatePercent,
              calculationVersion: nutritionTarget.calculationVersion
            }
          : null

      const result = await createManualDietPlan(payload, {
        targets: {
          calories: parseFloat(calories),
          protein: parseFloat(protein),
          carbs: parseFloat(carbs),
          fat: parseFloat(fat)
        },
        nutritionProfile: nutritionProfilePayload,
        nutritionTargetMeta: nutritionTargetMetaPayload,
        trainingNutrition: {
          trainingTime: trainingNutrition.trainingTime || null,
          trainingTimeCustom: trainingNutrition.trainingTime === 'custom' ? trainingNutrition.trainingTimeCustom : null,
          supplements: trainingNutrition.supplements
        },
        isNewPlanFlow
      })

      if ('error' in result) {
        submittingManualPlanRef.current = false
        setError(result.error)
        setPhase('error')
        return
      }

      // The plan is fully saved at this point - only the (optional) Meal
      // Reminders step remains. Draft persistence continues (see the
      // effect above) so a refresh mid-step-9 doesn't strand the user.
      setCreatedMeals(result.meals)
      const defaults = defaultReminderTimes(result.meals.length)
      setManualReminders({
        enabled: initialRemindersEnabled ?? false,
        perMeal: result.meals.map((_, i) => ({ time: defaults[i], enabled: true }))
      })
      submittingManualPlanRef.current = false
      setPhase('idle')
      setStep(9)
    } catch (err: unknown) {
      submittingManualPlanRef.current = false
      setError((err instanceof Error && err.message) || 'Failed to save your meal plan.')
      setPhase('error')
    }
  }

  const handleFinishReminders = async () => {
    setError(null)
    setSavingReminders(true)
    try {
      const mealReminders = createdMeals.map((meal, i) => ({
        mealId: meal.id,
        time: manualReminders.perMeal[i]?.time ?? null,
        enabled: manualReminders.perMeal[i]?.enabled ?? true
      }))
      const result = await saveMealReminders(
        mealReminders,
        manualReminders.enabled,
        Intl.DateTimeFormat().resolvedOptions().timeZone
      )
      if ('error' in result) {
        // The plan itself already saved successfully (step 8) - a reminder
        // failure here is surfaced inline, never as the full-screen error
        // state, so it can't read as "your plan didn't save".
        setError(result.error)
        setSavingReminders(false)
        return
      }
      clearOnboardingDraft()
      setSavingReminders(false)
      setPhase('success')
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'Failed to save your reminders.')
      setSavingReminders(false)
    }
  }

  const handleSkipReminders = () => {
    setError(null)
    clearOnboardingDraft()
    setPhase('success')
  }

  const handleContinue = () => {
    router.push('/dashboard')
    router.refresh()
  }

  const handleGoBack = () => {
    setError(null)
    setPhase('idle')
  }

  if (phase !== 'idle') {
    return (
      <div className="w-full max-w-xl mx-auto">
        <GeneratingPanel
          key={attempt}
          status={phase}
          errorMessage={error}
          onRetry={path === 'manual' ? handleManualSubmit : handleSubmit}
          onGoBack={handleGoBack}
          onContinue={handleContinue}
          mode={path === 'manual' ? 'manual' : 'ai'}
        />
      </div>
    )
  }

  const derivedCalories = Math.round(
    (parseFloat(protein) || 0) * 4 + (parseFloat(carbs) || 0) * 4 + (parseFloat(fat) || 0) * 9
  )
  const enteredCalories = parseFloat(calories) || 0
  const calorieMismatch =
    enteredCalories > 0 &&
    Math.abs(derivedCalories - enteredCalories) / enteredCalories > CALORIE_MISMATCH_TOLERANCE

  return (
    <Card className="w-full max-w-xl mx-auto p-8 space-y-8">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="font-display text-lg font-semibold text-primary">{STEP_LABELS[step - 1]}</span>
          <span className="text-xs text-muted-foreground">Step {step} of {TOTAL_STEPS}</span>
        </div>
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-label="Onboarding progress"
        >
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i < step ? 'bg-primary' : 'bg-surface-elevated'}`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
          <AlertIcon size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: About You */}
      {step === 1 && <ProfileStep value={profile} onChange={setProfile} onSkip={handleSkipProfile} />}

      {/* Step 2: Goal */}
      {step === 2 && <GoalStep value={goal} onChange={setGoal} />}

      {/* Step 3: Targets */}
      {step === 3 && (
        <div className="space-y-6 animate-step-in">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              {calculatorUsed ? 'Your starting target' : "Let's build your diet"}
            </h1>
            <p className="text-muted-foreground">
              {calculatorUsed
                ? 'These are starting estimates - accept them or adjust any number below.'
                : 'Enter your daily targets.'}
            </p>
          </div>

          {calculatorUsed && nutritionTarget && (
            <div className="space-y-3 p-4 rounded-control border border-border bg-surface-elevated">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">
                  Estimated maintenance:{' '}
                  <span className="font-mono tabular-nums text-foreground">
                    {nutritionTarget.estimatedMaintenanceCalories}
                  </span>{' '}
                  kcal/day &middot; Goal: <span className="text-foreground font-semibold">{GOAL_LABELS[nutritionTarget.goal]}</span>
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    targetsSource === 'recommended' ? 'bg-primary/10 text-primary' : 'bg-surface text-muted-foreground border border-border'
                  }`}
                >
                  {targetsSource === 'recommended' ? 'Recommended' : 'Custom'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{formatRate(nutritionTarget)}</p>
              <p className="text-xs text-muted-foreground">
                These are starting estimates, not exact measurements. We&apos;ll use your progress over time to help refine them.
              </p>
              {nutritionTarget.warnings.map(w => (
                <div key={w} className="flex items-start gap-2 pt-1 text-xs text-warning">
                  <AlertIcon size={14} className="shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
              <details className="text-xs text-muted-foreground pt-1">
                <summary className="cursor-pointer font-semibold text-foreground">Why these numbers?</summary>
                <ul className="mt-2 space-y-1.5 list-disc list-inside">
                  <li>Calories: based on estimated maintenance and your selected goal.</li>
                  <li>Protein: calculated from body weight and training goal.</li>
                  <li>Fat: set to a practical minimum based on body weight.</li>
                  <li>Carbs: the remaining calories after protein and fat.</li>
                </ul>
              </details>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Daily Calories"
              type="number"
              numeric
              value={calories}
              onChange={e => editTargetField(setCalories)(e.target.value)}
              trailing="kcal"
            />
            <Input
              label="Protein (g)"
              type="number"
              numeric
              value={protein}
              onChange={e => editTargetField(setProtein)(e.target.value)}
              trailing="g"
            />
            <Input
              label="Carbohydrates (g)"
              type="number"
              numeric
              value={carbs}
              onChange={e => editTargetField(setCarbs)(e.target.value)}
              trailing="g"
            />
            <Input
              label="Fat (g)"
              type="number"
              numeric
              value={fat}
              onChange={e => editTargetField(setFat)(e.target.value)}
              trailing="g"
            />
          </div>

          {calorieMismatch && (
            <div className="flex items-start gap-2 p-4 text-sm text-warning bg-warning/10 border border-warning/30 rounded-control">
              <AlertIcon size={18} className="shrink-0 mt-0.5" />
              <span>
                Your protein, carbs, and fat add up to about{' '}
                <span className="font-mono tabular-nums">{derivedCalories}</span> kcal, but your calorie
                target is <span className="font-mono tabular-nums">{enteredCalories}</span> kcal. You can
                continue anyway - just make sure this is intentional.
              </span>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <label htmlFor="meals-per-day" className="text-sm font-semibold text-foreground block">
              Meals Per Day
            </label>
            <div className="relative">
              <select
                id="meals-per-day"
                value={meals}
                onChange={e => setMeals(e.target.value)}
                className="w-full min-h-[44px] appearance-none bg-background border border-border rounded-control px-4 py-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors cursor-pointer"
              >
                <option value="3">3 Meals</option>
                <option value="4">4 Meals</option>
                <option value="5">5 Meals</option>
                <option value="6">6 Meals</option>
              </select>
              <ChevronDownIcon
                size={18}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 4 (dead AI path): Proteins - path can never actually be 'ai' */}
      {step === 4 && path === 'ai' && (
        <FoodStep
          title="Select Your Proteins"
          description="Choose the protein sources you prefer."
          items={PROTEINS}
          selected={selectedProteins}
          onToggle={id => toggleSelection(id, selectedProteins, setSelectedProteins)}
          defaultCategory="protein"
          onFoodCreated={handleFoodCreatedFor(['protein', 'dairy'], selectedProteins, setSelectedProteins)}
        />
      )}

      {/* Step 4: Nutrition Creation Choice */}
      {step === 4 && path !== 'ai' && (
        <NutritionCreationChoice value={path === 'manual' ? 'manual' : null} onChange={handleSelectManualPath} />
      )}

      {/* Step 5 (dead AI path): Carbs */}
      {step === 5 && path === 'ai' && (
        <FoodStep
          title="Select Your Carbs"
          description="Choose the carbohydrate sources you prefer."
          items={CARBS}
          selected={selectedCarbs}
          onToggle={id => toggleSelection(id, selectedCarbs, setSelectedCarbs)}
          defaultCategory="carbohydrate"
          onFoodCreated={handleFoodCreatedFor(['carbohydrate', 'fruit'], selectedCarbs, setSelectedCarbs)}
        />
      )}

      {/* Step 5: Training & Supplements (existing component, reused verbatim) */}
      {step === 5 && path === 'manual' && <TrainingNutritionStep value={trainingNutrition} onChange={setTrainingNutrition} />}

      {/* Step 6 (dead AI path): Fats */}
      {step === 6 && path === 'ai' && (
        <FoodStep
          title="Select Your Fats"
          description="Choose the fat sources you prefer."
          items={FATS}
          selected={selectedFats}
          onToggle={id => toggleSelection(id, selectedFats, setSelectedFats)}
          defaultCategory="fat"
          onFoodCreated={handleFoodCreatedFor(['fat'], selectedFats, setSelectedFats)}
        />
      )}

      {/* Step 6: Daily Targets recap */}
      {step === 6 && path === 'manual' && (
        <DailyTargetsStep
          calories={parseFloat(calories) || 0}
          protein={parseFloat(protein) || 0}
          carbs={parseFloat(carbs) || 0}
          fat={parseFloat(fat) || 0}
        />
      )}

      {/* Step 7 (dead AI path): Training Nutrition Setup */}
      {step === 7 && path === 'ai' && <TrainingNutritionStep value={trainingNutrition} onChange={setTrainingNutrition} />}

      {/* Step 7: Meal Builder */}
      {step === 7 && path === 'manual' && (
        <ManualMealBuilderStep
          meals={manualMeals}
          setMeals={setManualMeals}
          foodOptions={manualFoodOptionsList}
          targets={{
            calories: parseFloat(calories) || 0,
            protein: parseFloat(protein) || 0,
            carbs: parseFloat(carbs) || 0,
            fat: parseFloat(fat) || 0
          }}
          nextTempId={nextTempId}
          onFoodCreated={handleManualFoodCreated}
        />
      )}

      {/* Step 8 (dead AI path): Reminders - keeps its original position-matched behavior */}
      {step === 8 && path === 'ai' && <RemindersStep value={reminders} onChange={setReminders} />}

      {/* Step 8: Final Review */}
      {step === 8 && path === 'manual' && (
        <FinalReviewStep
          meals={manualMeals}
          targets={{
            calories: parseFloat(calories) || 0,
            protein: parseFloat(protein) || 0,
            carbs: parseFloat(carbs) || 0,
            fat: parseFloat(fat) || 0
          }}
          foodOptions={manualFoodOptionsList}
        />
      )}

      {/* Step 9: Meal Reminders - only reachable after step 8's Create Plan
          has already succeeded (createdMeals is populated by
          handleManualSubmit), addressed by real meal id/name. */}
      {step === 9 && path === 'manual' && (
        <RemindersStep value={manualReminders} onChange={setManualReminders} mealNames={createdMeals.map(m => m.name)} />
      )}

      {/* Actions */}
      <div className="flex gap-4 pt-6 border-t border-border">
        {step > 1 && !(path === 'manual' && step === 9) && (
          <Button variant="secondary" onClick={handleBack}>
            Back
          </Button>
        )}

        {path === 'manual' && step === 9 ? (
          <div className="flex gap-4 flex-1">
            <Button variant="secondary" onClick={handleSkipReminders} className="flex-1">
              Skip for now
            </Button>
            <Button variant="primary" onClick={handleFinishReminders} loading={savingReminders} className="flex-1">
              Finish
            </Button>
          </div>
        ) : path === 'manual' && step === 8 ? (
          // handleManualSubmit itself guards re-entrancy via
          // submittingManualPlanRef (a ref, not state - checked/set
          // synchronously, before React's next render can even unmount this
          // button) so a double-click here or on GeneratingPanel's "Try
          // Again" retry button can never both reach the server.
          <Button variant="primary" onClick={handleManualSubmit} className="flex-1">
            Create Plan
          </Button>
        ) : path === 'ai' && step === TOTAL_STEPS ? (
          <Button variant="primary" onClick={handleSubmit} className="flex-1">
            Generate Meal Plan
          </Button>
        ) : (
          <Button variant="primary" onClick={handleNext} loading={savingSupplementFoods} className="flex-1">
            Continue
          </Button>
        )}
      </div>
    </Card>
  )
}
