'use client'

import { useMemo, useState } from 'react'
import { calculateFoodMacros } from '@/lib/nutrition/calculator'
import type { FoodOption } from './DietEditor'
import Button from '@/components/ui/Button'
import { SearchIcon } from '@/components/ui/icons'

const MAX_RESULTS = 8

type Props = {
  foodOptions: FoodOption[]
  onAdd: (foodDatabaseId: string, quantity: number) => void
  onClose: () => void
}

export default function AddFoodPopover({ foodOptions, onAdd, onClose }: Props) {
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
  const preview = selected && isFinite(parsedQuantity) && parsedQuantity > 0
    ? calculateFoodMacros(parsedQuantity, selected)
    : null

  const handleAdd = () => {
    if (!selected || !preview) return
    onAdd(selected.id, parsedQuantity)
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
                  onClick={() => setSelected(food)}
                  className="w-full min-h-[44px] text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-elevated text-sm flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="text-foreground">{food.name}</span>
                  <span className="font-mono tabular-nums text-xs text-muted-foreground">{food.calories} kcal/100g</span>
                </button>
              ))}
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No foods match &quot;{query}&quot;.</p>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
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
              aria-label="Quantity"
              className="w-20 min-h-[44px] text-center bg-surface border border-border rounded-lg text-sm font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="text-xs text-muted-foreground">{selected.serving_unit}</span>
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
