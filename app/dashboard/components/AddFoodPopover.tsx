'use client'

import { useMemo, useState } from 'react'
import { calculateFoodMacros } from '@/lib/nutrition/calculator'
import type { FoodOption } from './DietEditor'

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
    <div className="mt-3 p-4 rounded-2xl bg-[#0B0E14] border border-indigo-500/30 space-y-3">
      {!selected ? (
        <>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search foods..."
            className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {results.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.map(food => (
                <button
                  key={food.id}
                  onClick={() => setSelected(food)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-[#161B22] hover:bg-gray-800 text-sm flex items-center justify-between"
                >
                  <span>{food.name}</span>
                  <span className="text-xs text-gray-500">{food.calories} kcal/100g</span>
                </button>
              ))}
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <p className="text-xs text-gray-500">No foods match &quot;{query}&quot;.</p>
          )}
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-gray-300">Change</button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="w-20 text-center bg-[#161B22] border border-gray-700 rounded-lg py-1 text-sm"
            />
            <span className="text-xs text-gray-500">{selected.serving_unit}</span>
          </div>
          {preview && (
            <div className="flex gap-3 text-xs font-semibold">
              <span className="text-white/70">{Math.round(preview.calories)} kcal</span>
              <span className="text-blue-400">{Math.round(preview.protein)}p</span>
              <span className="text-orange-400">{Math.round(preview.carbs)}c</span>
              <span className="text-yellow-400">{Math.round(preview.fat)}f</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 text-xs bg-[#161B22] border border-gray-700 hover:bg-gray-800 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!preview}
              className="flex-1 px-3 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold"
            >
              Add
            </button>
          </div>
        </>
      )}
    </div>
  )
}
