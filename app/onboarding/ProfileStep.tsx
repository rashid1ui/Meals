'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { ChevronDownIcon } from '@/components/ui/icons'
import { lbToKg, kgToLb, isValidHeightCm, HEIGHT_CM_MIN, HEIGHT_CM_MAX, type Sex, type ActivityLevel } from '@/lib/nutrition/engine'

export interface ProfileFormValue {
  sex: Sex | ''
  age: string
  // weightInput is the raw value in weightUnit; weightInKg() below always
  // derives the canonical kg value from it (kg is the canonical unit the
  // engine and DB use - same pattern as lib/nutrition/units.ts for foods).
  weightUnit: 'kg' | 'lb'
  weightInput: string
  heightCm: string
  activityLevel: ActivityLevel | ''
  trainingDaysPerWeek: string
  bodyFatPercent: string
  averageDailySteps: string
  currentCalorieIntake: string
}

export function emptyProfileFormValue(): ProfileFormValue {
  return {
    sex: '',
    age: '',
    weightUnit: 'kg',
    weightInput: '',
    heightCm: '',
    activityLevel: '',
    trainingDaysPerWeek: '',
    bodyFatPercent: '',
    averageDailySteps: '',
    currentCalorieIntake: ''
  }
}

export function weightInKg(value: ProfileFormValue): number | null {
  const raw = parseFloat(value.weightInput)
  if (!raw || raw <= 0) return null
  return value.weightUnit === 'lb' ? lbToKg(raw) : raw
}

// null for "not a valid height" - covers empty input, non-numeric input,
// decimals, and anything outside [HEIGHT_CM_MIN, HEIGHT_CM_MAX] (which is
// also exactly "not 3 digits", e.g. 75 or 1200). Mirrors weightInKg()'s
// shape/pattern above so the two fields validate the same way.
export function heightInCm(value: ProfileFormValue): number | null {
  const raw = Number(value.heightCm)
  if (value.heightCm === '' || !isValidHeightCm(raw)) return null
  return raw
}

// Bounds mirror the DB's own CHECK constraints (profiles.age,
// profiles.training_days_per_week) - the client's <Input max=...> hints are
// HTML attributes only and don't block a value typed past them.
const MAX_VALID_AGE = 119
const MAX_TRAINING_DAYS_PER_WEEK = 7

export function isProfileFormComplete(value: ProfileFormValue): boolean {
  const age = parseFloat(value.age)
  const trainingDays = parseFloat(value.trainingDaysPerWeek)
  return Boolean(
    value.sex &&
      value.age &&
      Number.isFinite(age) &&
      age > 0 &&
      age <= MAX_VALID_AGE &&
      weightInKg(value) !== null &&
      heightInCm(value) !== null &&
      value.activityLevel &&
      value.trainingDaysPerWeek !== '' &&
      Number.isFinite(trainingDays) &&
      trainingDays >= 0 &&
      trainingDays <= MAX_TRAINING_DAYS_PER_WEEK
  )
}

// Describes movement OUTSIDE structured training only - "Training Days /
// Week" above already captures gym/workout frequency, so these options must
// never mention exercise days or gym frequency (that would make the two
// inputs redundant again). 'extremely_active' remains a valid ActivityLevel
// for the engine/DB (untouched), it's just not offered as a choice here -
// "Very Active" already covers a physical job + high daily movement.
const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Mostly Sedentary', hint: 'Desk job, little walking, mostly sitting' },
  { value: 'lightly_active', label: 'Lightly Active', hint: 'Desk job + regular walking/movement during the day' },
  { value: 'moderately_active', label: 'Moderately Active', hint: 'Active job or lots of walking throughout the day' },
  { value: 'very_active', label: 'Very Active', hint: 'Physical job + high daily movement' }
]

type Props = {
  value: ProfileFormValue
  onChange: (value: ProfileFormValue) => void
  onSkip: () => void
}

export default function ProfileStep({ value, onChange, onSkip }: Props) {
  const [showOptional, setShowOptional] = useState(false)

  const set = <K extends keyof ProfileFormValue>(key: K, val: ProfileFormValue[K]) =>
    onChange({ ...value, [key]: val })

  const toggleWeightUnit = () => {
    const currentKg = weightInKg(value)
    const nextUnit = value.weightUnit === 'kg' ? 'lb' : 'kg'
    if (currentKg === null) {
      onChange({ ...value, weightUnit: nextUnit })
      return
    }
    const nextValue = nextUnit === 'lb' ? kgToLb(currentKg) : currentKg
    onChange({ ...value, weightUnit: nextUnit, weightInput: nextValue.toFixed(1) })
  }

  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Tell us about yourself</h1>
        <p className="text-muted-foreground">
          We&apos;ll use this to estimate a science-based starting point for your calories and macros.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground block">Sex</span>
        <div className="grid grid-cols-2 gap-3">
          {(['male', 'female'] as Sex[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => set('sex', s)}
              className={`min-h-[44px] rounded-control border px-4 py-2.5 text-sm font-semibold capitalize transition-colors cursor-pointer ${
                value.sex === s
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-surface-elevated'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Age"
          type="number"
          numeric
          min={1}
          max={119}
          value={value.age}
          onChange={e => set('age', e.target.value)}
          trailing="years"
        />
        <Input
          label="Height"
          type="number"
          numeric
          min={HEIGHT_CM_MIN}
          max={HEIGHT_CM_MAX}
          placeholder="e.g. 175 cm"
          value={value.heightCm}
          onChange={e => set('heightCm', e.target.value)}
          trailing="cm"
          error={value.heightCm !== '' && heightInCm(value) === null ? 'Enter your height in cm (e.g. 175).' : undefined}
        />
        <div className="relative">
          <Input
            label="Weight"
            type="number"
            numeric
            min={0}
            step="0.1"
            value={value.weightInput}
            onChange={e => set('weightInput', e.target.value)}
            trailing={
              <button
                type="button"
                onClick={toggleWeightUnit}
                className="pointer-events-auto text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                {value.weightUnit}
              </button>
            }
          />
        </div>
        <Input
          label="Training Days / Week"
          type="number"
          numeric
          min={0}
          max={7}
          value={value.trainingDaysPerWeek}
          onChange={e => set('trainingDaysPerWeek', e.target.value)}
          trailing="days"
          helperText="How many days per week do you do planned workouts?"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="activity-level" className="text-sm font-semibold text-foreground block">
          Daily Activity Outside Training
        </label>
        <p className="text-xs text-muted-foreground -mt-1">
          How much do you move during the rest of your day - not counting workouts?
        </p>
        <div className="relative">
          <select
            id="activity-level"
            value={value.activityLevel}
            onChange={e => set('activityLevel', e.target.value as ActivityLevel)}
            className="w-full min-h-[44px] appearance-none bg-background border border-border rounded-control pl-4 pr-10 py-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors cursor-pointer"
          >
            <option value="" disabled>
              Select your daily activity outside training
            </option>
            {ACTIVITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label} - {opt.hint}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={18}
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowOptional(prev => !prev)}
          className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronDownIcon
            size={16}
            className={`transition-transform ${showOptional ? 'rotate-180' : ''}`}
          />
          Optional details (improves future refinements)
        </button>
        {showOptional && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Input
              label="Body Fat %"
              type="number"
              numeric
              min={0}
              max={100}
              value={value.bodyFatPercent}
              onChange={e => set('bodyFatPercent', e.target.value)}
              trailing="%"
              helperText="Optional"
            />
            <Input
              label="Avg Daily Steps"
              type="number"
              numeric
              min={0}
              value={value.averageDailySteps}
              onChange={e => set('averageDailySteps', e.target.value)}
              helperText="Optional"
            />
            <Input
              label="Current Intake"
              type="number"
              numeric
              min={0}
              value={value.currentCalorieIntake}
              onChange={e => set('currentCalorieIntake', e.target.value)}
              trailing="kcal"
              helperText="Optional"
            />
          </div>
        )}
      </div>

      <div className="pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSkip} className="!px-0">
          Skip - I&apos;ll enter my targets manually
        </Button>
      </div>
    </div>
  )
}
