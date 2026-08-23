'use client'

import type { Goal } from '@/lib/nutrition/engine'

// No auto-recommendation: the app has no prior weight history or target
// weight to base one on, and the spec is explicit that a recommendation
// must never be invented from a rule that wasn't given (Part 17). The user
// picks directly from a short, honest description of each goal.
// Emoji are prepended to `label` only (display text) - `value` is the
// stored Goal enum, unchanged and never touched by this decoration.
const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: 'cut', label: '🔥 Cut', description: 'Lose fat with a modest calorie deficit while preserving muscle.' },
  { value: 'recomp', label: '⚖️ Recomp', description: 'Stay near maintenance, aiming to change body composition, not the scale.' },
  { value: 'lean_bulk', label: '💪 Lean Bulk', description: 'Build muscle with a small calorie surplus, minimizing fat gain.' },
  { value: 'maintain', label: '🛡️ Maintain', description: 'Keep your current weight and body composition stable.' }
]

type Props = {
  value: Goal | ''
  onChange: (goal: Goal) => void
}

export default function GoalStep({ value, onChange }: Props) {
  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Choose your goal</h1>
        <p className="text-muted-foreground">This shapes your starting calorie and macro targets. You can change it any time.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GOAL_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`text-left rounded-control border p-4 transition-colors cursor-pointer ${
              value === opt.value
                ? 'border-primary bg-primary/10'
                : 'border-border hover:bg-surface-elevated'
            }`}
          >
            <span className={`block font-display font-semibold mb-1 ${value === opt.value ? 'text-primary' : 'text-foreground'}`}>
              {opt.label}
            </span>
            <span className="block text-sm text-muted-foreground">{opt.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
