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
import { validateSupplementSetup } from '@/lib/diet/supplements'

import type { SupplementSetup } from '@/lib/types'

export interface TrainingNutritionFormValue {
  trainingTime: TrainingTime | ''
  trainingTimeCustom: string // "HH:MM", only used when trainingTime === 'custom'
  supplements: SupplementSetup[]
}

export function emptyTrainingNutritionFormValue(): TrainingNutritionFormValue {
  return {
    trainingTime: '',
    trainingTimeCustom: '',
    supplements: []
  }
}

export function isTrainingNutritionFormComplete(value: TrainingNutritionFormValue): boolean {
  if (!value.trainingTime) return false
  if (value.trainingTime === 'custom' && !value.trainingTimeCustom) return false
  
  for (const supp of value.supplements) {
    if (!supp.serving_label.trim()) return false
    if (supp.type === 'whey') {
      const grams = supp.amount_per_serving_g || 0
      if (!isFinite(grams) || grams <= 0) return false
    }
    // creatine and other can be more lenient, but serving label is required
    if (validateSupplementSetup(supp)) return false
  }
  return true
}

// Emoji are prepended to `label` only (display text) - `value` is the
// stored TrainingTime enum, unchanged and never touched by this decoration.
const TRAINING_TIME_OPTIONS: { value: TrainingTime; label: string; hint: string }[] = [
  { value: 'morning', label: '🌅 Morning', hint: 'Before midday' },
  { value: 'afternoon', label: '🌤️ Afternoon', hint: 'Midday to evening' },
  { value: 'evening', label: '🌙 Evening', hint: 'After work, later in the day' },
  { value: 'custom', label: '⏰ Exact time', hint: "I'll enter my usual time" }
]

// Emoji are prepended to `label` only (display text) - `value` is the
// stored SupplementSetup['type'] enum, unchanged and never touched by this
// decoration.
const SUPPLEMENT_OPTIONS: { value: SupplementSetup['type']; label: string }[] = [
  { value: 'whey', label: '🥤 Whey Protein' },
  { value: 'creatine', label: '⚡ Creatine' },
  { value: 'other', label: '💊 Other' }
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
          <button
            type="button"
            onClick={() => set('supplements', [])}
            className={`min-h-[44px] rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
              value.supplements.length === 0
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-foreground hover:bg-surface-elevated'
            }`}
          >
            ❌ No
          </button>
          {SUPPLEMENT_OPTIONS.map(opt => {
            const isSelected = value.supplements.some(s => s.type === opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    set('supplements', value.supplements.filter(s => s.type !== opt.value))
                  } else {
                    set('supplements', [...value.supplements, { type: opt.value, serving_label: '' }])
                  }
                }}
                className={`min-h-[44px] rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-foreground hover:bg-surface-elevated'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="space-y-4 mt-4">
          {value.supplements.map((supp, index) => {
            const updateSupp = (updates: Partial<SupplementSetup>) => {
              const newSupps = [...value.supplements]
              newSupps[index] = { ...newSupps[index], ...updates }
              set('supplements', newSupps)
            }

            if (supp.type === 'whey') {
              return (
                <div key="whey" className="p-4 rounded-control border border-border bg-surface-elevated space-y-4">
                  <h3 className="font-semibold text-foreground">Whey Protein Setup</h3>
                  <p className="text-xs text-muted-foreground">
                    This gets saved as a food you can log each day, so your whey shake counts automatically toward your protein target.
                  </p>
                  <Input
                    label="Protein brand (Optional)"
                    placeholder="e.g. ON Gold Standard"
                    value={supp.brand || ''}
                    onChange={e => updateSupp({ brand: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Serving size"
                      placeholder="e.g. 1 scoop"
                      value={supp.serving_label}
                      onChange={e => updateSupp({ serving_label: e.target.value })}
                    />
                    <Input
                      label="Protein per scoop"
                      type="number"
                      numeric
                      min={0}
                      max={200}
                      placeholder="e.g. 24"
                      value={supp.amount_per_serving_g != null ? String(supp.amount_per_serving_g) : ''}
                      onChange={e => updateSupp({ amount_per_serving_g: e.target.value ? parseFloat(e.target.value) : undefined })}
                      trailing="g"
                    />
                  </div>
                </div>
              )
            }

            if (supp.type === 'creatine') {
              return (
                <div key="creatine" className="p-4 rounded-control border border-border bg-surface-elevated space-y-4">
                  <h3 className="font-semibold text-foreground">Creatine Setup</h3>
                  <p className="text-xs text-muted-foreground">
                    Creatine contains 0 calories and does not affect your daily macros.
                  </p>
                  <Input
                    label="Creatine brand (Optional)"
                    placeholder="e.g. Optimum Nutrition"
                    value={supp.brand || ''}
                    onChange={e => updateSupp({ brand: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Serving size"
                      placeholder="e.g. 1 scoop"
                      value={supp.serving_label}
                      onChange={e => updateSupp({ serving_label: e.target.value })}
                    />
                    <Input
                      label="Creatine per scoop"
                      type="number"
                      numeric
                      min={0}
                      max={100}
                      placeholder="e.g. 5"
                      value={supp.amount_per_serving_g != null ? String(supp.amount_per_serving_g) : ''}
                      onChange={e => updateSupp({ amount_per_serving_g: e.target.value ? parseFloat(e.target.value) : undefined })}
                      trailing="g"
                    />
                  </div>
                </div>
              )
            }

            if (supp.type === 'other') {
              return (
                <div key="other" className="p-4 rounded-control border border-border bg-surface-elevated space-y-4">
                  <h3 className="font-semibold text-foreground">Other Supplement</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Supplement Name"
                      placeholder="e.g. Fish Oil"
                      value={supp.brand || ''}
                      onChange={e => updateSupp({ brand: e.target.value })}
                    />
                    <Input
                      label="Serving size"
                      placeholder="e.g. 2 pills"
                      value={supp.serving_label}
                      onChange={e => updateSupp({ serving_label: e.target.value })}
                    />
                  </div>
                  <Input
                    label="Notes (Optional)"
                    placeholder="Any extra details"
                    value={supp.notes || ''}
                    onChange={e => updateSupp({ notes: e.target.value })}
                  />
                </div>
              )
            }
            return null
          })}
        </div>
      </div>
    </div>
  )
}
