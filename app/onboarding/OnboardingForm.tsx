'use client'

import { useMemo, useState } from 'react'
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
import { AlertIcon, ChevronDownIcon } from '@/components/ui/icons'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'
import { buildNutritionTarget, type ActivityLevel, type Goal, type NutritionTarget } from '@/lib/nutrition/engine'
import type { UserProfile } from '@/lib/types'

type Food = {
  id: string
  name: string
  category: string
}

type Props = {
  foods: Food[]
  isNewPlanFlow?: boolean
  // Pre-fills the Profile/Goal steps from the user's saved profile row (and
  // their current plan's goal, if any) so the regenerate-plan flow
  // (?newPlan=true) reopens with last-saved values instead of blank -
  // that's what makes "change goal later" just re-running this wizard.
  initialProfile?: Partial<UserProfile> | null
  initialGoal?: Goal | null
}

const STEP_LABELS = ['About You', 'Goal', 'Targets', 'Protein', 'Carbs', 'Fat']
const TOTAL_STEPS = STEP_LABELS.length

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
    trainingDaysPerWeek: p.training_days_per_week != null ? String(p.training_days_per_week) : '',
    bodyFatPercent: p.body_fat_percent != null ? String(p.body_fat_percent) : '',
    averageDailySteps: p.average_daily_steps != null ? String(p.average_daily_steps) : '',
    currentCalorieIntake: p.current_calorie_intake != null ? String(p.current_calorie_intake) : ''
  }
}

function formatRate(target: NutritionTarget): string {
  if (target.targetWeeklyRatePercent === 0) return 'Aim for an approximately stable bodyweight'
  const direction = target.targetWeeklyRatePercent < 0 ? 'loss' : 'gain'
  return `~${Math.abs(target.targetWeeklyRatePercent)}% bodyweight/week ${direction}`
}

export default function OnboardingForm({ foods, isNewPlanFlow = false, initialProfile = null, initialGoal = null }: Props) {
  // Local copy of the server-fetched catalog so a custom food created via
  // FoodStep's "Add Custom Food" appears (and can be selected) immediately,
  // without a page reload. It's still the same food_database row underneath
  // (createFoodDatabaseEntry persists it for real) - this is purely a UI
  // mirror of that table, kept in sync on each creation.
  const [foodList, setFoodList] = useState<Food[]>(foods)

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
  const [step, setStep] = useState(1)
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
  const [profile, setProfile] = useState<ProfileFormValue>(() => profileFormFromUserProfile(initialProfile))
  const [goal, setGoal] = useState<Goal | ''>(initialGoal ?? '')
  const [calculatorSkipped, setCalculatorSkipped] = useState(false)
  const [nutritionTarget, setNutritionTarget] = useState<NutritionTarget | null>(null)
  const [targetsSource, setTargetsSource] = useState<'recommended' | 'custom'>('custom')
  const calculatorUsed = !calculatorSkipped && nutritionTarget !== null

  // Form State
  const [calories, setCalories] = useState('2250')
  const [protein, setProtein] = useState('150')
  const [carbs, setCarbs] = useState('250')
  const [fat, setFat] = useState('70')
  const [meals, setMeals] = useState('4')

  const [selectedProteins, setSelectedProteins] = useState<string[]>([])
  const [selectedCarbs, setSelectedCarbs] = useState<string[]>([])
  const [selectedFats, setSelectedFats] = useState<string[]>([])

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

  const handleNext = () => {
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
      if (!calories || !protein || !carbs || !fat) {
        setError('Please fill in all macro targets.')
        return
      }
      setStep(4)
      return
    }

    if (step === 4) {
      if (selectedProteins.length === 0) {
        setError('Please select at least one protein source.')
        return
      }
      setStep(5)
      return
    }

    if (step === 5) {
      if (selectedCarbs.length === 0) {
        setError('Please select at least one carbohydrate source.')
        return
      }
      setStep(6)
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
        setPhase('success')
      }
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'Failed to generate meal plan.')
      setPhase('error')
    }
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
          onRetry={handleSubmit}
          onGoBack={handleGoBack}
          onContinue={handleContinue}
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
        <div className="flex items-start gap-2 p-4 text-sm text-error bg-error/10 border border-error/30 rounded-lg">
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
            <div className="space-y-3 p-4 rounded-lg border border-border bg-surface-elevated">
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
            <div className="flex items-start gap-2 p-4 text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg">
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
                className="w-full min-h-[44px] appearance-none bg-background border border-border rounded-lg px-4 py-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors cursor-pointer"
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

      {/* Step 4: Proteins */}
      {step === 4 && (
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

      {/* Step 5: Carbs */}
      {step === 5 && (
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

      {/* Step 6: Fats */}
      {step === 6 && (
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

      {/* Actions */}
      <div className="flex gap-4 pt-6 border-t border-border">
        {step > 1 && (
          <Button variant="secondary" onClick={handleBack}>
            Back
          </Button>
        )}

        {step < TOTAL_STEPS ? (
          <Button variant="primary" onClick={handleNext} className="flex-1">
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={handleSubmit} className="flex-1">
            Generate Meal Plan
          </Button>
        )}
      </div>
    </Card>
  )
}
