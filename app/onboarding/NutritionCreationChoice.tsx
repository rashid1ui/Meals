'use client'

// Two-card choice screen. Only "Create My Own Plan" is clickable - the AI
// card is a permanently disabled placeholder (see the plan's "AI planner is
// only a placeholder for future development" requirement). `value` can only
// ever be 'manual' | null in practice, since there is no way to select 'ai'
// through this UI - the old AI-generation steps/action remain fully intact
// in the codebase, just unreachable.

type Props = {
  value: 'manual' | null
  onChange: (value: 'manual') => void
}

export default function NutritionCreationChoice({ value, onChange }: Props) {
  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">How do you want to build your plan?</h1>
        <p className="text-muted-foreground">Choose how your meals get created. You can always fine-tune your plan afterward.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('manual')}
          className={`text-left rounded-control border p-4 transition-colors cursor-pointer ${
            value === 'manual' ? 'border-primary bg-primary/10' : 'border-border hover:bg-surface-elevated'
          }`}
        >
          <span className={`block font-display font-semibold mb-1 ${value === 'manual' ? 'text-primary' : 'text-foreground'}`}>
            📝 Create My Own Plan
          </span>
          <span className="block text-sm text-muted-foreground">
            Build your meals yourself from our food library, with live guidance to hit your macros.
          </span>
        </button>

        <div
          aria-disabled="true"
          className="text-left rounded-control border border-border p-4 opacity-50 cursor-not-allowed relative"
        >
          <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 border border-primary/30 px-2 py-1 rounded-full">
            Coming Soon 🚀
          </span>
          <span className="block font-display font-semibold mb-1 text-foreground pr-20">🤖 AI Meal Planner</span>
          <span className="block text-sm text-muted-foreground">
            Let AI generate a complete meal plan for you automatically.
          </span>
        </div>
      </div>
    </div>
  )
}
