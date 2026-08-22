'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

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
    <Modal onClose={onCancel} labelledBy="add-meal-title">
      <h3 id="add-meal-title" className="font-display text-2xl font-bold text-foreground mb-6">
        Add a Meal
      </h3>

      <div className="space-y-2 mb-4">
        <label className="text-sm text-foreground font-semibold block">Meal Type</label>
        <div className="grid grid-cols-2 gap-2">
          {MEAL_TYPES.map(type => (
            <button
              key={type}
              type="button"
              aria-pressed={mealType === type}
              onClick={() => setMealType(type)}
              className={`min-h-[44px] px-3 rounded-control text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated ${
                mealType === type
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-background border-border text-foreground hover:border-muted-foreground'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {mealType === 'Custom Meal' && (
        <div className="mb-4">
          <Input
            label="Meal Name"
            autoFocus
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="e.g. Midnight Snack"
          />
        </div>
      )}

      <div className="mb-6">
        <label className="text-sm text-foreground font-semibold block mb-2">Time (optional)</label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="w-full min-h-[44px] bg-background border border-border rounded-control px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
        />
      </div>

      <div className="flex gap-4">
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button variant="primary" onClick={() => canAdd && onAdd(finalName)} disabled={!canAdd} className="flex-1">
          Add Meal
        </Button>
      </div>
    </Modal>
  )
}
