'use client'

import { useState } from 'react'
import {
  requiresGramsPerUnit,
  isValidGramsPerUnit,
  DISPLAY_UNIT_OPTIONS
} from '@/lib/nutrition/units'
import { createFoodDatabaseEntry, type CreateFoodInput } from '@/app/dashboard/food-actions'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { AlertIcon } from '@/components/ui/icons'

export const FOOD_CATEGORY_OPTIONS = [
  { value: 'protein', label: 'Protein' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'carbohydrate', label: 'Carbohydrate' },
  { value: 'fruit', label: 'Fruit' },
  { value: 'fat', label: 'Fat' }
]

type Props = {
  onCreated: (food: FoodOption) => void
  onCancel: () => void
  defaultCategory?: CreateFoodInput['category']
  title?: string
  description?: string
}

// Shared "create a food" form used both by the dashboard's AddFoodPopover
// (adding a food to one meal) and the onboarding FoodStep (adding a food to
// the selectable catalog before generation). Both paths go through the same
// createFoodDatabaseEntry server action, so a food created here is a real
// food_database row immediately available to the AI meal-plan generator -
// never a UI-only, temporary entry.
export default function CreateFoodForm({
  onCreated,
  onCancel,
  defaultCategory = 'protein',
  title = 'Add a New Food',
  description = 'This adds a shared food available to all your future meals.'
}: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [unit, setUnit] = useState('g')
  const [gramsPerUnit, setGramsPerUnit] = useState('50')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsWeight = requiresGramsPerUnit(unit)
  const per100Label = unit === 'ml' ? 'per 100ml' : 'per 100g'

  const handleSubmit = async () => {
    setError(null)
    const parsedGramsPerUnit = needsWeight ? parseFloat(gramsPerUnit) : null
    if (needsWeight && (parsedGramsPerUnit === null || !isValidGramsPerUnit(parsedGramsPerUnit))) {
      setError('Enter a realistic weight per unit (greater than 0).')
      return
    }

    const parsedNutrition = [calories, protein, carbs, fat].map(v => parseFloat(v))
    if (parsedNutrition.some(v => !isFinite(v) || v < 0)) {
      setError('Enter valid nutrition values (0 or greater) for every field.')
      return
    }

    setSaving(true)
    const result = await createFoodDatabaseEntry({
      name,
      category,
      displayUnit: unit,
      gramsPerDisplayUnit: parsedGramsPerUnit,
      caloriesPer100: parsedNutrition[0],
      proteinPer100: parsedNutrition[1],
      carbsPer100: parsedNutrition[2],
      fatPer100: parsedNutrition[3]
    })
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
      return
    }
    onCreated(result.data)
  }

  return (
    <div className="mt-3 p-4 rounded-lg bg-background border border-primary/30 space-y-4">
      <div>
        <h4 className="font-display text-sm font-bold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      <Input label="Food Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Whole Eggs" />

      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground block">Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as CreateFoodInput['category'])}
          className="w-full min-h-[44px] bg-surface border border-border rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {FOOD_CATEGORY_OPTIONS.map(c => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground block">Measurement Unit</label>
        <select
          value={unit}
          onChange={e => setUnit(e.target.value)}
          className="w-full min-h-[44px] bg-surface border border-border rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {DISPLAY_UNIT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {needsWeight && (
        <Input
          label={`Weight per ${unit} (g)`}
          type="number"
          numeric
          value={gramsPerUnit}
          onChange={e => setGramsPerUnit(e.target.value)}
          helperText={`e.g. 1 ${unit} ≈ ${gramsPerUnit || '?'}g`}
        />
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Nutrition {per100Label}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Calories" type="number" numeric value={calories} onChange={e => setCalories(e.target.value)} />
          <Input label="Protein (g)" type="number" numeric value={protein} onChange={e => setProtein(e.target.value)} />
          <Input label="Carbs (g)" type="number" numeric value={carbs} onChange={e => setCarbs(e.target.value)} />
          <Input label="Fat (g)" type="number" numeric value={fat} onChange={e => setFat(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 text-sm text-error bg-error/10 border border-error/30 rounded-lg">
          <AlertIcon size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          loading={saving}
          disabled={!name.trim()}
          className="flex-1"
        >
          Add Food
        </Button>
      </div>
    </div>
  )
}
