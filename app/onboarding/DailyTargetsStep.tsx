'use client'

// Pure read-only recap of the step-3 targets, shown right before the Meal
// Builder so the user has a clear "this is what you're building toward"
// checkpoint. Stat layout mirrors MealCard's Target row
// (app/dashboard/components/MealCard.tsx): font-mono tabular-nums numbers,
// text-calories/protein/carbs/fat color tokens.

type Props = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export default function DailyTargetsStep({ calories, protein, carbs, fat }: Props) {
  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Your daily targets</h1>
        <p className="text-muted-foreground">
          This is what you&apos;ll be building your meals toward. Go back to Targets if you want to change these.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Calories</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-calories">{Math.round(calories)}</div>
          <span className="text-xs text-muted-foreground">kcal / day</span>
        </div>
        <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Protein</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-protein">{Math.round(protein)}g</div>
          <span className="text-xs text-muted-foreground">per day</span>
        </div>
        <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Carbs</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-carbs">{Math.round(carbs)}g</div>
          <span className="text-xs text-muted-foreground">per day</span>
        </div>
        <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Fat</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-fat">{Math.round(fat)}g</div>
          <span className="text-xs text-muted-foreground">per day</span>
        </div>
      </div>
    </div>
  )
}
