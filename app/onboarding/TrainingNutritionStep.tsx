'use client'

// Onboarding step - "Training Nutrition Setup" (spec section 1). Collects
// when the user trains and whether they use supplements, so the dashboard
// can recommend suitable pre/post-workout meals (lib/nutrition/workoutMeals.ts)
// and automatically fold whey protein into daily protein tracking once it's
// been logged (see app/onboarding/actions.ts, which turns a configured whey
// entry into a real, trackable food via the existing meal/food system -
// never a separate, parallel bookkeeping path).

import type { TrainingTime } from '@/lib/nutrition/workoutMeals'
import Input from '@/components/ui/Input'

export type SupplementChoice = 'none' | 'whey' | 'creatine' | 'other'

export interface TrainingNutritionFormValue {
  trainingTime: TrainingTime | ''
  trainingTimeCustom: string // "HH:MM", only used when trainingTime === 'custom'
  supplement: SupplementChoice
  proteinBrand: string
  proteinServingLabel: string
  proteinPerServingG: string
}

export function emptyTrainingNutritionFormValue(): TrainingNutritionFormValue {
  return {
    trainingTime: '',
    trainingTimeCustom: '',
    supplement: 'none',
    proteinBrand: '',
    proteinServingLabel: '',
    proteinPerServingG: ''
  }
}

export function isTrainingNutritionFormComplete(value: TrainingNutritionFormValue): boolean {
  if (!value.trainingTime) return false
  if (value.trainingTime === 'custom' && !value.trainingTimeCustom) return false
  if (value.supplement === 'whey') {
    const grams = parseFloat(value.proteinPerServingG)
    if (!value.proteinServingLabel.trim() || !isFinite(grams) || grams <= 0) return false
  }
  return true
}

const TRAINING_TIME_OPTIONS: { value: TrainingTime; label: string; hint: string }[] = [
  { value: 'morning', label: 'Morning', hint: 'Before midday' },
  { value: 'afternoon', label: 'Afternoon', hint: 'Midday to evening' },
  { value: 'evening', label: 'Evening', hint: 'After work, later in the day' },
  { value: 'custom', label: 'Exact time', hint: "I'll enter my usual time" }
]

const SUPPLEMENT_OPTIONS: { value: SupplementChoice; label: string }[] = [
  { value: 'none', label: 'No' },
  { value: 'whey', label: 'Whey Protein' },
  { value: 'creatine', label: 'Creatine' },
  { value: 'other', label: 'Other' }
]

type Props = {
  value: TrainingNutritionFormValue
  onChange: (value: TrainingNutritionFormValue) => void
}

export default function TrainingNutritionStep({ value, onChange }: Props) {
  const set = <K extends keyof TrainingNutritionFormValue>(key: K, val: TrainingNutritionFormValue[K]) =>
    onChange({ ...value, [key]: val })

  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Training Nutrition Setup</h1>
        <p className="text-muted-foreground">
          We&apos;ll use this to recommend pre- and post-workout meals, and to count your supplements toward your daily protein.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground block">When do you usually train?</span>
        <div className="grid grid-cols-2 gap-3">
          {TRAINING_TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('trainingTime', opt.value)}
              className={`text-left rounded-control border p-4 transition-colors cursor-pointer ${
                value.trainingTime === opt.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-surface-elevated'
              }`}
            >
              <span className={`block font-display font-semibold ${value.trainingTime === opt.value ? 'text-primary' : 'text-foreground'}`}>
                {opt.label}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">{opt.hint}</span>
            </button>
          ))}
        </div>

        {value.trainingTime === 'custom' && (
          <div className="pt-2 max-w-[200px]">
            <Input
              label="Usual training time"
              type="time"
              value={value.trainingTimeCustom}
              onChange={e => set('trainingTimeCustom', e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-6">
        <span className="text-sm font-semibold text-foreground block">Do you take supplements?</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SUPPLEMENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('supplement', opt.value)}
              className={`min-h-[44px] rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                value.supplement === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-surface-elevated'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {value.supplement === 'whey' && (
          <div className="mt-4 p-4 rounded-control border border-border bg-surface-elevated space-y-4">
            <p className="text-xs text-muted-foreground">
              This gets saved as a food you can log each day, so your whey shake counts automatically toward your protein target.
            </p>
            <Input
              label="Protein brand"
              placeholder="e.g. ON Gold Standard"
              value={value.proteinBrand}
              onChange={e => set('proteinBrand', e.target.value)}
              helperText="Optional"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Serving size"
                placeholder="e.g. 1 scoop"
                value={value.proteinServingLabel}
                onChange={e => set('proteinServingLabel', e.target.value)}
              />
              <Input
                label="Protein per scoop"
                type="number"
                numeric
                min={0}
                max={200}
                placeholder="e.g. 24"
                value={value.proteinPerServingG}
                onChange={e => set('proteinPerServingG', e.target.value)}
                trailing="g"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
