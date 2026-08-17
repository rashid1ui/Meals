'use client'

import { useState } from 'react'

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Pre-Workout', 'Post-Workout', 'Custom Meal'] as const
type MealType = typeof MEAL_TYPES[number]

// Formats a 24h "HH:MM" input value into a compact 12h label, e.g. "6:30 AM".
function formatTime(time: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hours = parseInt(match[1], 10)
  const minutes = match[2]
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = ((hours + 11) % 12) + 1
  return `${displayHours}:${minutes} ${period}`
}

type Props = {
  onAdd: (name: string) => void
  onCancel: () => void
}

export default function AddMealModal({ onAdd, onCancel }: Props) {
  const [mealType, setMealType] = useState<MealType>('Snack')
  const [customName, setCustomName] = useState('')
  const [time, setTime] = useState('')

  const baseName = mealType === 'Custom Meal' ? customName.trim() : mealType
  const formattedTime = formatTime(time)
  const finalName = formattedTime && baseName ? `${baseName} • ${formattedTime}` : baseName

  const canAdd = baseName.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="w-full max-w-md bg-[#161B22] border border-gray-800 rounded-3xl p-8 shadow-2xl relative z-10 text-white">
        <h3 className="text-2xl font-extrabold mb-6">Add a Meal</h3>

        <div className="space-y-2 mb-4">
          <label className="text-sm text-gray-300 font-semibold">Meal Type</label>
          <div className="grid grid-cols-2 gap-2">
            {MEAL_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setMealType(type)}
                className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  mealType === type
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-300'
                    : 'bg-[#0B0E14] border-gray-700 hover:border-gray-500'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {mealType === 'Custom Meal' && (
          <div className="space-y-2 mb-4">
            <label className="text-sm text-gray-300 font-semibold">Meal Name</label>
            <input
              autoFocus
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="e.g. Midnight Snack"
              className="w-full bg-[#0B0E14] border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        <div className="space-y-2 mb-6">
          <label className="text-sm text-gray-300 font-semibold">Time (optional)</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="w-full bg-[#0B0E14] border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-[#0B0E14] border border-gray-700 hover:bg-gray-800 rounded-xl font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => canAdd && onAdd(finalName)}
            disabled={!canAdd}
            className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-all"
          >
            Add Meal
          </button>
        </div>
      </div>
    </div>
  )
}
