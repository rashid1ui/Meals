'use client'

import { useState } from 'react'
import type { DraftFood, DraftMeal, FoodBadge } from '@/lib/diet/diff'

const QUANTITY_STEP = 10

const BADGE_STYLES: Record<FoodBadge, string> = {
  added: 'bg-green-500/15 text-green-400 border-green-500/30',
  increased: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  decreased: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  moved: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
}

const BADGE_LABELS: Record<FoodBadge, string> = {
  added: 'Added',
  increased: 'Increased',
  decreased: 'Decreased',
  moved: 'Moved'
}

type Props = {
  food: DraftFood
  meal: DraftMeal
  otherMeals: DraftMeal[]
  badges: FoodBadge[]
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
  onMove: (toMealId: string) => void
}

export default function FoodRow({ food, otherMeals, badges, onQuantityChange, onRemove, onMove }: Props) {
  const [inputValue, setInputValue] = useState(String(food.quantity))
  const locked = food.foodDatabaseId === null

  const commitQuantity = (value: number) => {
    if (!isFinite(value) || value <= 0) return
    onQuantityChange(value)
  }

  const step = (delta: number) => {
    const next = Math.max(QUANTITY_STEP, food.quantity + delta)
    setInputValue(String(next))
    commitQuantity(next)
  }

  return (
    <div className="p-3 rounded-2xl bg-[#0B0E14] border border-gray-800/60 hover:border-indigo-500/30 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-200 truncate">{food.name}</span>
            {badges.map(badge => (
              <span
                key={badge}
                className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full border ${BADGE_STYLES[badge]}`}
              >
                {BADGE_LABELS[badge]}
              </span>
            ))}
            {locked && (
              <span
                className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full border bg-gray-700/30 text-gray-400 border-gray-600/40"
                title="This food's original nutrition data couldn't be matched, so its quantity can't be safely recalculated. It can still be moved or removed."
              >
                Locked
              </span>
            )}
          </div>
          <div className="flex gap-3 text-xs font-semibold mt-1">
            <span className="text-white/70">{Math.round(food.calories)} kcal</span>
            <span className="text-blue-400">{Math.round(food.protein)}p</span>
            <span className="text-orange-400">{Math.round(food.carbs)}c</span>
            <span className="text-yellow-400">{Math.round(food.fat)}f</span>
          </div>
        </div>

        <button
          onClick={onRemove}
          aria-label={`Remove ${food.name}`}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-red-900/20 border border-red-500/30 text-red-300 hover:bg-red-900/40 transition-colors"
        >
          &times;
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-QUANTITY_STEP)}
            disabled={locked}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold"
          >
            &minus;
          </button>
          <input
            type="number"
            value={inputValue}
            disabled={locked}
            onChange={e => setInputValue(e.target.value)}
            onBlur={() => commitQuantity(parseFloat(inputValue))}
            className="w-16 text-center bg-[#161B22] border border-gray-700 rounded-lg py-1 text-sm disabled:opacity-40"
          />
          <span className="text-xs text-gray-500">{food.unit}</span>
          <button
            onClick={() => step(QUANTITY_STEP)}
            disabled={locked}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold"
          >
            +
          </button>
        </div>

        {otherMeals.length > 0 && (
          <select
            value=""
            onChange={e => {
              if (e.target.value) onMove(e.target.value)
            }}
            className="text-xs bg-[#161B22] border border-gray-700 rounded-lg px-2 py-1 text-gray-400"
          >
            <option value="">Move to...</option>
            {otherMeals.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
