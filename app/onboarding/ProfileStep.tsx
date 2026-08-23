'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { AlertIcon, ChevronDownIcon } from '@/components/ui/icons'
import {
  lbToKg,
  kgToLb,
  isValidHeightCm,
  isValidWeightKg,
  classifyBmiWarning,
  classifyBodyFatWarning,
  HEIGHT_CM_MIN,
  HEIGHT_CM_MAX,
  WEIGHT_KG_MIN,
  WEIGHT_KG_MAX,
  type Sex,
  type ActivityLevel
} from '@/lib/nutrition/engine'

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
  // '' = unanswered (first-time user), 'yes'/'no' otherwise. Gates whether
  // Training Days/Week is shown/required at all - see isProfileFormComplete
  // and profileFormFromUserProfile (OnboardingForm.tsx), which derives this
  // straight from the existing training_days_per_week column so no new DB
  // field is needed.
  doesTrain: 'yes' | 'no' | ''
  trainingDaysPerWeek: string
  bodyFatPercent: string
  averageDailySteps: string
  currentCalorieIntake: string
  // True once the user has explicitly acknowledged an active BMI/body-fat
  // soft warning. Recomputed as "active" every render from the current
  // weight/height/bodyFat values (see bmiWarning/bodyFatWarning below) -
  // this flag only records that acknowledgment happened at some point, so a
  // stale ack for old numbers never silently carries over once those values
  // change again (isProfileFormComplete re-checks the warning is still the
  // one that was acknowledged is out of scope; instead callers clear this
  // flag themselves whenever weight/height/bodyFat change - see `set`).
  bmiWarningAcknowledged: boolean
}

export function emptyProfileFormValue(): ProfileFormValue {
  return {
    sex: '',
    age: '',
    weightUnit: 'kg',
    weightInput: '',
    heightCm: '',
    activityLevel: '',
    doesTrain: '',
    trainingDaysPerWeek: '',
    bodyFatPercent: '',
    averageDailySteps: '',
    currentCalorieIntake: '',
    bmiWarningAcknowledged: false
  }
}

export function weightInKg(value: ProfileFormValue): number | null {
  const raw = parseFloat(value.weightInput)
  if (!raw || raw <= 0 || !isValidWeightKg(value.weightUnit === 'lb' ? lbToKg(raw) : raw)) return null
  return value.weightUnit === 'lb' ? lbToKg(raw) : raw
}

// Live, continuously-recomputed derived warning - not a one-time check on
// submit. Only active once both weight and height are present; body-fat is
// independent and optional.
export function activeBmiOrBodyFatWarning(value: ProfileFormValue): string | null {
  const weightKg = weightInKg(value)
  const heightCm = heightInCm(value)
  if (weightKg !== null && heightCm !== null) {
    const bmiWarning = classifyBmiWarning(weightKg, heightCm)
    if (bmiWarning) return bmiWarning
  }
  if (value.bodyFatPercent !== '') {
    const bodyFat = parseFloat(value.bodyFatPercent)
    if (Number.isFinite(bodyFat)) {
      const bodyFatWarning = classifyBodyFatWarning(bodyFat)
      if (bodyFatWarning) return bodyFatWarning
    }
  }
  return null
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
  // 0 days while claiming "I train" doesn't make sense, so trainingDays is
  // only validated in [1, MAX] when doesTrain === 'yes'; when 'no', it's
  // implicitly 0 and not checked at all (cleared to '0' by the toggle below).
  const trainingDaysValid =
    value.doesTrain === 'no' ||
    (value.trainingDaysPerWeek !== '' &&
      Number.isFinite(trainingDays) &&
      trainingDays >= 1 &&
      trainingDays <= MAX_TRAINING_DAYS_PER_WEEK)
  return Boolean(
    value.sex &&
      value.age &&
      Number.isFinite(age) &&
      age > 0 &&
      age <= MAX_VALID_AGE &&
      weightInKg(value) !== null &&
      heightInCm(value) !== null &&
      value.activityLevel &&
      value.doesTrain &&
      trainingDaysValid &&
      (activeBmiOrBodyFatWarning(value) === null || value.bmiWarningAcknowledged)
  )
}

// Describes movement OUTSIDE structured training only - "Training Days /
// Week" above already captures gym/workout frequency, so these options must
// never mention exercise days or gym frequency (that would make the two
// inputs redundant again). 'extremely_active' remains a valid ActivityLevel
// for the engine/DB (untouched), it's just not offered as a choice here -
// "Very Active" already covers a physical job + high daily movement.
// Emoji are prepended to `label` only (display text) - `value` is the
// stored ActivityLevel enum, unchanged and never touched by this decoration.
const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: '🪑 Mostly Sedentary', hint: 'Desk job, little walking, mostly sitting' },
  { value: 'lightly_active', label: '🚶 Lightly Active', hint: 'Desk job + regular walking/movement during the day' },
  { value: 'moderately_active', label: '🏃 Moderately Active', hint: 'Active job or lots of walking throughout the day' },
  { value: 'very_active', label: '🔥 Very Active', hint: 'Physical job + high daily movement' }
]

type Props = {
  value: ProfileFormValue
  onChange: (value: ProfileFormValue) => void
  onSkip: () => void
}

export default function ProfileStep({ value, onChange, onSkip }: Props) {
  const [showOptional, setShowOptional] = useState(false)

  const set = <K extends keyof ProfileFormValue>(key: K, val: ProfileFormValue[K]) => {
    // Weight/height/body-fat feed the BMI/body-fat warning - a previously
    // acknowledged warning must not silently carry over once the underlying
    // numbers change again.
    const clearsAcknowledgment = key === 'weightInput' || key === 'heightCm' || key === 'bodyFatPercent'
    onChange({ ...value, [key]: val, ...(clearsAcknowledgment ? { bmiWarningAcknowledged: false } : {}) })
  }

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

  const setDoesTrain = (doesTrain: 'yes' | 'no') => {
    onChange({
      ...value,
      doesTrain,
      // "No" has a well-defined answer for training days (0); "yes" needs a
      // real answer from the user, so a stale '0' from a previous "no" is
      // cleared rather than left behind as a misleadingly-valid value.
      trainingDaysPerWeek: doesTrain === 'no' ? '0' : value.trainingDaysPerWeek === '0' ? '' : value.trainingDaysPerWeek
    })
  }

  const warning = activeBmiOrBodyFatWarning(value)

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
            min={WEIGHT_KG_MIN}
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
            error={
              value.weightInput !== '' && weightInKg(value) === null
                ? `Weight must be between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.`
                : undefined
            }
          />
        </div>
      </div>

      {warning && (
        <div className="flex items-start gap-2 p-4 text-sm text-warning bg-warning/10 border border-warning/30 rounded-control">
          <AlertIcon size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <span>{warning}</span>
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={value.bmiWarningAcknowledged}
                onChange={e => onChange({ ...value, bmiWarningAcknowledged: e.target.checked })}
                className="h-4 w-4 rounded border-border accent-warning"
              />
              I&apos;ve double-checked this value and it&apos;s correct
            </label>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground block">Do you train?</span>
        <div className="grid grid-cols-2 gap-3">
          {(['yes', 'no'] as const).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setDoesTrain(opt)}
              className={`min-h-[44px] rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                value.doesTrain === opt
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-surface-elevated'
              }`}
            >
              {opt === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>

      {value.doesTrain === 'yes' && (
        <Input
          label="Training Days / Week"
          type="number"
          numeric
          min={1}
          max={7}
          value={value.trainingDaysPerWeek}
          onChange={e => set('trainingDaysPerWeek', e.target.value)}
          trailing="days"
          helperText="How many days per week do you do planned workouts?"
        />
      )}

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
