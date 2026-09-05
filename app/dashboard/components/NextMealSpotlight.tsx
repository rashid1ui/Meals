'use client'

import type { DraftMeal } from '@/lib/diet/diff'
import { computeMealTotals } from '@/lib/diet/diff'
import { formatMealName } from '@/lib/nutrition/workoutMeals'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import StoredImageThumb from '@/components/images/StoredImageThumb'
import { ChevronRightIcon } from '@/components/ui/icons'

type Props = {
  meal: DraftMeal
  onView: () => void
}

// Section 6 - answers "what should I focus on next?" without duplicating the
// full editable meal card below it. Purely a read-only spotlight + a jump
// link into the matching card in the grid (see DietEditor's scrollToMeal).
export default function NextMealSpotlight({ meal, onView }: Props) {
  const totals = computeMealTotals(meal)

  return (
    <Card elevated className="p-5 border-primary/40">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <StoredImageThumb
            image={{
              image_url: meal.imageUrl,
              image_alt: meal.imageAlt,
              image_attribution: meal.imageAttribution
            }}
            fallback={<span className="text-2xl leading-none">🍽️</span>}
            fallbackAlt={`Photo representing ${meal.name}`}
            sizeClassName="w-12 h-12"
            className="mt-0.5"
          />
          <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">Next Meal</span>
          <h3 className="font-display text-2xl font-bold text-foreground tracking-tight truncate mt-0.5">
            {formatMealName(meal.name)}
          </h3>
          <div className="flex items-center gap-3 flex-wrap mt-2 font-mono tabular-nums text-sm">
            <span className="font-semibold text-calories">{Math.round(totals.calories)} kcal</span>
            <span className="text-protein">{Math.round(totals.protein)}P</span>
            <span className="text-carbs">{Math.round(totals.carbs)}C</span>
            <span className="text-fat">{Math.round(totals.fat)}F</span>
          </div>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={onView} className="shrink-0">
          View Meal
          <ChevronRightIcon size={14} />
        </Button>
      </div>
    </Card>
  )
}
