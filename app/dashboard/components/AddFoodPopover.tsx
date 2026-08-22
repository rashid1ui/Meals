'use client'

import { useMemo, useState } from 'react'
import { calculateFoodMacros } from '@/lib/nutrition/calculator'
import {
  toCanonicalGrams,
  requiresGramsPerUnit,
  unitLabel,
  type UnitConfig
} from '@/lib/nutrition/units'
import CreateFoodForm from '@/components/food/CreateFoodForm'
import type { FoodOption } from './DietEditor'
import Button from '@/components/ui/Button'
import { SearchIcon, PlusIcon } from '@/components/ui/icons'

const MAX_RESULTS = 8

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

