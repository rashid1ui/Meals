'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitOnboarding } from './actions'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FoodStep from './FoodStep'
import GeneratingPanel from './GeneratingPanel'
import { AlertIcon, ChevronDownIcon } from '@/components/ui/icons'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'

type Food = {
  id: string
  name: string
  category: string
}

type Props = {
  foods: Food[]
  isNewPlanFlow?: boolean
}

const STEP_LABELS = ['Targets', 'Protein', 'Carbs', 'Fat']

// Non-blocking sanity check only - protein/carbs/fat grams don't have to add
// up exactly to the calorie target (users round, and that's fine), but a
// large mismatch is worth surfacing before generation runs.
const CALORIE_MISMATCH_TOLERANCE = 0.1

export default function OnboardingForm({ foods, isNewPlanFlow = false }: Props) {
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

  const handleNext = () => {
    setError(null)
    if (step === 1) {
      if (!calories || !protein || !carbs || !fat) {
        setError('Please fill in all macro targets.')
        return
      }
    } else if (step === 2) {
      if (selectedProteins.length === 0) {
        setError('Please select at least one protein source.')
        return
      }
    } else if (step === 3) {
      if (selectedCarbs.length === 0) {
        setError('Please select at least one carbohydrate source.')
        return
      }
    }
    setStep(prev => prev + 1)
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
          <span className="text-xs text-muted-foreground">Step {step} of 4</span>
        </div>
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={4}
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

      {/* Step 1: Macros */}
      {step === 1 && (
        <div className="space-y-6 animate-step-in">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">Let&apos;s build your diet</h1>
            <p className="text-muted-foreground">First, enter your daily targets.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Daily Calories"
              type="number"
              numeric
              value={calories}
              onChange={e => setCalories(e.target.value)}
              trailing="kcal"
            />
            <Input
              label="Protein (g)"
              type="number"
              numeric
              value={protein}
              onChange={e => setProtein(e.target.value)}
              trailing="g"
            />
            <Input
              label="Carbohydrates (g)"
              type="number"
              numeric
              value={carbs}
              onChange={e => setCarbs(e.target.value)}
              trailing="g"
            />
            <Input
              label="Fat (g)"
              type="number"
              numeric
              value={fat}
              onChange={e => setFat(e.target.value)}
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

      {/* Step 2: Proteins */}
      {step === 2 && (
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

      {/* Step 3: Carbs */}
      {step === 3 && (
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

      {/* Step 4: Fats */}
      {step === 4 && (
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
          <Button variant="secondary" onClick={() => setStep(prev => prev - 1)}>
            Back
          </Button>
        )}

        {step < 4 ? (
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
