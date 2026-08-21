'use client'

import { useMemo, useState } from 'react'
import { calculateFoodMacros } from '@/lib/nutrition/calculator'
import {
  toCanonicalGrams,
  requiresGramsPerUnit,
  isValidGramsPerUnit,
  unitLabel,
  DISPLAY_UNIT_OPTIONS,
  type UnitConfig
} from '@/lib/nutrition/units'
import { createFoodDatabaseEntry } from '../food-actions'
import type { FoodOption } from './DietEditor'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { SearchIcon, PlusIcon, AlertIcon } from '@/components/ui/icons'

const MAX_RESULTS = 8
const CATEGORY_OPTIONS = [
  { value: 'protein', label: 'Protein' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'carbohydrate', label: 'Carbohydrate' },
  { value: 'fruit', label: 'Fruit' },
  { value: 'fat', label: 'Fat' }
]

type Props = {
  foodOptions: FoodOption[]
  onAdd: (foodDatabaseId: string, quantity: number) => void
  onClose: () => void
  // Lets the parent (DietEditor) add a newly-created food to its own
  // lookup/search list immediately, without a page refresh.
  onFoodCreated?: (food: FoodOption) => void
}

function unitConfigFor(food: FoodOption): UnitConfig {
  return { displayUnit: food.display_unit || 'g', gramsPerDisplayUnit: food.grams_per_display_unit || 1 }
}

export default function AddFoodPopover({ foodOptions, onAdd, onClose, onFoodCreated }: Props) {
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<FoodOption | null>(null)
  const [quantity, setQuantity] = useState('100')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return foodOptions
      .filter(f => f.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
  }, [foodOptions, query])

  const parsedQuantity = parseFloat(quantity)
  const unitConfig = selected ? unitConfigFor(selected) : null
  const canonicalGrams =
    unitConfig && isFinite(parsedQuantity) && parsedQuantity > 0
      ? toCanonicalGrams(parsedQuantity, unitConfig)
      : null
  const preview = selected && canonicalGrams !== null ? calculateFoodMacros(canonicalGrams, selected) : null

  const selectFood = (food: FoodOption) => {
    setSelected(food)
    const isPieceLike = requiresGramsPerUnit(food.display_unit || 'g')
    setQuantity(isPieceLike ? '1' : '100')
  }

  const handleAdd = () => {
    if (!selected || canonicalGrams === null) return
    onAdd(selected.id, canonicalGrams)
  }

  if (mode === 'create') {
    return (
      <CreateFoodForm
        onCreated={food => {
          onFoodCreated?.(food)
          setMode('search')
          selectFood(food)
        }}
        onCancel={() => setMode('search')}
      />
    )
  }

  return (
    <div className="mt-3 p-4 rounded-lg bg-background border border-primary/30 space-y-3">
      {!selected ? (
        <>
          <div className="relative">
            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search foods..."
              aria-label="Search foods"
              className="w-full min-h-[44px] bg-surface border border-border rounded-lg pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          {results.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.map(food => (
                <button
                  key={food.id}
                  onClick={() => selectFood(food)}
                  className="w-full min-h-[44px] text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-elevated text-sm flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="text-foreground">{food.name}</span>
                  <span className="font-mono tabular-nums text-xs text-muted-foreground">
                    {food.calories} kcal/100{food.serving_unit === 'ml' ? 'ml' : 'g'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No foods match &quot;{query}&quot;.</p>
          )}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => setMode('create')}
              className="min-h-[44px] inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-strong transition-colors rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <PlusIcon size={14} />
              Can&apos;t find it? Add a new food
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-foreground">{selected.name}</span>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground min-h-[44px] px-2"
            >
              Change
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              aria-label={`Quantity in ${unitLabel(selected.display_unit || 'g', parsedQuantity || 0)}`}
              className="w-20 min-h-[44px] text-center bg-surface border border-border rounded-lg text-sm font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="text-sm font-semibold text-foreground">
              {unitLabel(selected.display_unit || 'g', parsedQuantity || 0)}
            </span>
          </div>
          {preview && (
            <div className="flex gap-3 font-mono tabular-nums text-xs font-semibold">
              <span className="text-foreground/70">{Math.round(preview.calories)} kcal</span>
              <span className="text-protein">{Math.round(preview.protein)}p</span>
              <span className="text-carbs">{Math.round(preview.carbs)}c</span>
              <span className="text-fat">{Math.round(preview.fat)}f</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={!preview} className="flex-1">
              Add
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function CreateFoodForm({ onCreated, onCancel }: { onCreated: (food: FoodOption) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('protein')
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
        <h4 className="font-display text-sm font-bold text-foreground">Add a New Food</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          This adds a shared food available to all your future meals.
        </p>
      </div>

      <Input label="Food Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Whole Eggs" />

      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground block">Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full min-h-[44px] bg-surface border border-border rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {CATEGORY_OPTIONS.map(c => (
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
