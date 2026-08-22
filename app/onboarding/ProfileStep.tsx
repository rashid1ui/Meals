'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { ChevronDownIcon } from '@/components/ui/icons'
import { lbToKg, kgToLb, type Sex, type ActivityLevel } from '@/lib/nutrition/engine'

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

export function isProfileFormComplete(value: ProfileFormValue): boolean {
  return Boolean(
    value.sex &&
      value.age &&
      parseFloat(value.age) > 0 &&
      weightInKg(value) !== null &&
      value.heightCm &&
      parseFloat(value.heightCm) > 0 &&
      value.activityLevel &&
      value.trainingDaysPerWeek !== ''
  )
}

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little to no exercise, desk job' },
  { value: 'lightly_active', label: 'Lightly Active', hint: 'Light exercise 1-3 days/week' },
  { value: 'moderately_active', label: 'Moderately Active', hint: 'Moderate exercise 3-5 days/week' },
  { value: 'very_active', label: 'Very Active', hint: 'Hard exercise 6-7 days/week' },
  { value: 'extremely_active', label: 'Extremely Active', hint: 'Very hard exercise, physical job' }
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
              className={`min-h-[44px] rounded-lg border px-4 py-2.5 text-sm font-semibold capitalize transition-colors cursor-pointer ${
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
          min={1}
          max={299}
          value={value.heightCm}
          onChange={e => set('heightCm', e.target.value)}
          trailing="cm"
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
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="activity-level" className="text-sm font-semibold text-foreground block">
          Activity Level
        </label>
        <div className="relative">
          <select
            id="activity-level"
            value={value.activityLevel}
            onChange={e => set('activityLevel', e.target.value as ActivityLevel)}
            className="w-full min-h-[44px] appearance-none bg-background border border-border rounded-lg pl-4 pr-10 py-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors cursor-pointer"
          >
            <option value="" disabled>
              Select your activity level
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
