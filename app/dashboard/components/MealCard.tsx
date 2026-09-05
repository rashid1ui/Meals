'use client'

import { useMemo, useState } from 'react'
import { computeMealTotals, getFoodBadges, type ChangeEntry, type DraftMeal, type MacroTotals as DailyMacroTotals } from '@/lib/diet/diff'
import { pctOf, type MacroTotals } from '@/lib/tracking/logic'
import { formatMealName } from '@/lib/nutrition/workoutMeals'
import type { FoodTrackingState } from '../tracking-actions'
import FoodRow from './FoodRow'
import FoodPickerModal from '@/components/food/FoodPickerModal'
import StoredImageThumb from '@/components/images/StoredImageThumb'
import type { FoodOption } from './DietEditor'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ProgressRing from '@/components/ui/ProgressRing'
import TrackingStatusIcon from '@/components/ui/TrackingStatusIcon'
import { PlusIcon, CheckIcon, CloseIcon, ChevronDownIcon } from '@/components/ui/icons'

const STATUS_TEXT_CLASS: Record<MealTrackingStatus, string> = {
  none: 'text-muted-foreground hover:text-foreground',
  partial: 'text-warning',
  complete: 'text-success'
}

export type MealTrackingStatus = 'none' | 'partial' | 'complete'

export type MealCompletionInfo = {
  status: MealTrackingStatus
  // What this meal is supposed to deliver in total vs. what's actually been
  // logged as eaten from it today - two distinct numbers, never merged.
  planned: MacroTotals
  actual: MacroTotals
  foods: ReadonlyMap<string, FoodTrackingState>
  onToggleMeal: () => void
  onLogFood: (foodId: string, consumedQuantity: number) => void
  // A non-blocking "saving" hint. `togglingMeal` is true while any food in
  // this meal has an unsaved change in flight; `savingFoodIds` is the live
  // set of those foods. Neither ever disables a control - the optimistic UI
  // has already updated.
  togglingMeal: boolean
  savingFoodIds: ReadonlySet<string>
}

type Props = {
  meal: DraftMeal
  changes: ChangeEntry[]
  foodOptions: FoodOption[]
  onRemoveFood: (foodId: string) => void
  onAddFood: (foodDatabaseId: string, quantity: number) => void
  onUpdateFoodQuantity?: (foodId: string, quantity: number) => void
  // Moves a food out of this meal into another one in the same draft,
  // preserving its quantity/macros verbatim - see lib/diet/diff.ts's moveFood.
  onMoveFood?: (foodId: string, targetMealId: string) => void
  // Every other meal in the current draft, offered as move destinations.
  otherMeals?: { id: string; name: string }[]
  onFoodCreated?: (food: FoodOption) => void
  // Removes this entire meal slot (and its foods) from the builder tree.
  // Undefined = not removable in this context: the dashboard editor never
  // passes it, and the Manual Meal Builder omits it on the last remaining
  // meal so a plan can never be emptied below validateMealsShape's minimum.
  onRemoveMeal?: () => void
  // Reorder this meal one position within the builder tree. Undefined for a
  // direction that is unavailable (first meal has no "up", last has no
  // "down") - the button still renders, disabled. Both undefined omits the
  // whole group (dashboard editor, or a single-meal plan).
  onMoveMealUp?: () => void
  onMoveMealDown?: () => void
  // Undefined for a meal that hasn't been saved yet (e.g. added but not
  // saved this session) - tracking only ever applies to persisted meals,
  // so the toggle is simply omitted rather than shown disabled.
  completion?: MealCompletionInfo
  // True for the single next-up (first non-complete, persisted) meal -
  // gets stronger visual hierarchy. See DietEditor's `nextMeal`.
  isNext?: boolean
  // Threaded down to FoodPickerModal's optional "Daily Progress" guidance
  // strip - both undefined simply omits it (e.g. no caller-computed daily
  // total available yet).
  dailyTargets?: DailyMacroTotals
  dailyTotals?: DailyMacroTotals
}

const STATUS_LABEL: Record<MealTrackingStatus, string> = {
  none: 'Not eaten',
  partial: 'Partially eaten',
  complete: 'Eaten'
}

// Splits formatMealName's "<emoji> <name>" output back into its parts so the
// emoji can sit in its own tinted tile (reference layout) while the full,
// untruncated name owns the heading. formatMealName returns the name
// unchanged when it matches no known meal keyword - that case yields a null
// emoji and the plain name, never a mangled slice.
function splitMealName(name: string): { emoji: string | null; label: string } {
  const formatted = formatMealName(name)
  if (formatted === name) return { emoji: null, label: name }
  const firstSpace = formatted.indexOf(' ')
  return { emoji: formatted.slice(0, firstSpace), label: name }
}

type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat'

const NUTRIENT_META: { key: NutrientKey; label: string; unit: string; valueClass: string }[] = [
  { key: 'calories', label: 'kcal', unit: '', valueClass: 'text-calories' },
  { key: 'protein', label: 'Protein', unit: 'g', valueClass: 'text-protein' },
  { key: 'carbs', label: 'Carbs', unit: 'g', valueClass: 'text-carbs' },
  { key: 'fat', label: 'Fat', unit: 'g', valueClass: 'text-fat' }
]

export default function MealCard({
  meal,
  changes,
  foodOptions,
  onRemoveFood,
  onAddFood,
  onUpdateFoodQuantity,
  onMoveFood,
  otherMeals,
  onFoodCreated,
  onRemoveMeal,
  onMoveMealUp,
  onMoveMealDown,
  completion,
  isNext = false,
  dailyTargets,
  dailyTotals
}: Props) {
  const [showAddFood, setShowAddFood] = useState(false)
  const target = computeMealTotals(meal)
  const isNewMeal = changes.some(c => c.type === 'meal-added' && c.mealName === meal.name)
  const status = completion?.status ?? 'none'
  // Visually quiet down an already-eaten meal that isn't the one to focus on
  // next - via reduced elevation/border emphasis, never by dimming text
  // opacity (would erode the 4.5:1 contrast the rest of the app guarantees).
  const recede = status === 'complete' && !isNext

  const actual = completion?.actual ?? null
  const actualPct = actual && target.calories > 0 ? Math.round(pctOf(actual.calories, target.calories)) : null
  // The completion ring only makes sense once this meal is actually
  // trackable (persisted + has foods) - an unsaved or empty meal shows the
  // target block alone, exactly as before.
  const showTracking = Boolean(actual && meal.foods.length > 0)

  const { emoji: mealEmoji, label: mealLabel } = useMemo(() => splitMealName(meal.name), [meal.name])

  const foodOptionsById = useMemo(() => {
    const map = new Map<string, FoodOption>()
    for (const f of foodOptions) map.set(f.id, f)
    return map
  }, [foodOptions])

  const foodCount = meal.foods.length

  return (
    <Card
      id={`meal-${meal.id}`}
      tabIndex={-1}
      elevated={isNext}
      className={`p-5 flex flex-col gap-4 scroll-mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isNext ? 'border-primary/50' : ''
      } ${recede ? 'opacity-[0.92]' : ''}`}
    >
      {/* Eyebrow bar: the NEXT / New markers on the left, the meal-completion
          toggle on the right. The toggle reads as plain status text
          ("○ Not eaten") rather than a heavy control, while staying fully
          clickable with a 44px hit area. It's a bulk-apply shortcut over the
          same per-food logging below, never an independently-stored flag. */}
      {(isNext || isNewMeal || completion) && (
        <div className="flex items-start justify-between gap-2 -mt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 pt-1">
            {isNext && (
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Next
              </span>
            )}
            {isNewMeal && (
              <span className="inline-flex items-center rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-success">
                New
              </span>
            )}
          </div>
          {completion && (
            <button
              type="button"
              role="checkbox"
              aria-checked={status === 'complete' ? true : status === 'partial' ? 'mixed' : false}
              aria-label={status === 'complete' ? `Mark ${meal.name} as not eaten` : `Mark all of ${meal.name} as eaten`}
              onClick={completion.onToggleMeal}
              aria-busy={completion.togglingMeal}
              className={`shrink-0 -mr-1 inline-flex items-center gap-1.5 min-h-[44px] px-1 rounded-md text-xs font-semibold transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${STATUS_TEXT_CLASS[status]}`}
            >
              <span className={completion.togglingMeal ? 'animate-pulse' : undefined}>
                <TrackingStatusIcon status={status} size={20} />
              </span>
              {STATUS_LABEL[status]}
            </button>
          )}
        </div>
      )}

      {/* Identity row: emoji tile + full meal name on the left, the
          completion ring (dashboard) or the Remove control (manual builder)
          on the right. The name column is min-w-0 + truncate and the right
          slot is shrink-0, so the title is never clipped to make room for a
          control - the bug this redesign explicitly guards against. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <StoredImageThumb
            image={{
              image_url: meal.imageUrl,
              image_alt: meal.imageAlt,
              image_attribution: meal.imageAttribution
            }}
            fallback={<span className="text-2xl leading-none">{mealEmoji ?? '🍽️'}</span>}
            fallbackAlt={`Photo representing ${meal.name}`}
            sizeClassName="w-11 h-11"
            className="rounded-control"
          />
          <div className="min-w-0 pt-0.5">
            <h3 className="font-display text-lg font-bold text-foreground flex items-start gap-1.5 min-w-0">
              {status === 'complete' && <CheckIcon size={16} className="text-success shrink-0 mt-1" />}
              {/* Wraps rather than truncating - a long meal name must stay
                  fully readable, never collapse to "B...". Real names
                  ("Breakfast", "Pre-Workout") are one line; a long custom
                  name simply takes the height it needs. */}
              <span className="min-w-0 break-words">{mealLabel}</span>
            </h3>
            <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
              {foodCount === 1 ? '1 food' : `${foodCount} foods`} planned
            </span>
          </div>
        </div>

        <div className="flex items-start gap-1 shrink-0">
          {showTracking && (
            <div className="flex flex-col items-center gap-0.5">
              <ProgressRing
                value={actualPct ?? 0}
                label={`${meal.name} - ${actualPct ?? 0}% of its target calories eaten`}
                size={60}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                complete
              </span>
            </div>
          )}
          {onRemoveMeal && (
            <button
              type="button"
              onClick={onRemoveMeal}
              aria-label={`Remove ${mealLabel} meal`}
              className="shrink-0 -mt-1 -mr-1.5 w-11 h-11 flex items-center justify-center rounded-control text-muted-foreground/60 hover:text-error hover:bg-error/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Nutrition summary: one compact block. The four big numbers are this
          meal's TARGET (planned) composition; the quiet "Eaten" row beneath
          is what's actually been logged so far - the two stay explicitly
          labelled and never merge. */}
      <div className="rounded-control bg-surface-elevated border border-border px-3 py-2.5">
        <div className="grid grid-cols-4 gap-1.5">
          {NUTRIENT_META.map(({ key, label, unit, valueClass }) => (
            <div key={key} className="min-w-0 text-center">
              <div className={`font-mono tabular-nums text-base font-bold leading-tight ${valueClass}`}>
                {Math.round(target[key])}{unit}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
                {label}
              </div>
            </div>
          ))}
        </div>

        {showTracking && actual && (
          <div className="mt-2 pt-2 border-t border-border flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono tabular-nums text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Eaten</span>
            <span className="font-bold text-foreground">{Math.round(actual.calories)} kcal</span>
            <span className="text-protein">{Math.round(actual.protein)}P</span>
            <span className="text-carbs">{Math.round(actual.carbs)}C</span>
            <span className="text-fat">{Math.round(actual.fat)}F</span>
          </div>
        )}
      </div>

      {/* Foods */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {foodCount > 0 ? `Foods (${foodCount})` : 'Foods'}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setShowAddFood(true)}>
            <PlusIcon size={14} />
            Add food
          </Button>
        </div>

        {foodCount === 0 ? (
          <div className="text-center py-6 px-4 rounded-control border border-dashed border-border">
            <p className="text-sm font-semibold text-foreground">No foods in this meal yet.</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Add a food to start building this meal.</p>
            <Button variant="secondary" size="sm" onClick={() => setShowAddFood(true)}>
              <PlusIcon size={14} />
              Add food
            </Button>
          </div>
        ) : (
          <div>
            {meal.foods.map(food => {
              const foodTracking = completion?.foods.get(food.id)
              return (
                <FoodRow
                  key={food.id}
                  food={food}
                  meal={meal}
                  badges={getFoodBadges(changes, food.id)}
                  onRemove={() => onRemoveFood(food.id)}
                  dbFood={food.foodDatabaseId ? foodOptionsById.get(food.foodDatabaseId) ?? null : null}
                  onUpdateQuantity={onUpdateFoodQuantity ? (q) => onUpdateFoodQuantity(food.id, q) : undefined}
                  onMove={onMoveFood ? (targetMealId) => onMoveFood(food.id, targetMealId) : undefined}
                  otherMeals={otherMeals}
                  completion={
                    completion && foodTracking
                      ? {
                          status: foodTracking.status,
                          consumedQuantity: foodTracking.consumedQuantity,
                          plannedQuantity: foodTracking.plannedQuantity,
                          actual: foodTracking.actual,
                          onLog: (consumedQuantity) => completion.onLogFood(food.id, consumedQuantity),
                          logging: completion.savingFoodIds.has(food.id)
                        }
                      : undefined
                  }
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Reorder row: its own quiet strip at the foot of the card (manual
          builder only - the dashboard editor passes neither handler). Text +
          icon, wraps on narrow widths, and never competes with the meal
          title for space. Each button is disabled at its boundary (first
          meal has no "up", last has no "down"). */}
      {(onMoveMealUp || onMoveMealDown) && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-2.5 border-t border-border/60">
          <button
            type="button"
            onClick={onMoveMealUp}
            disabled={!onMoveMealUp}
            aria-label={`Move ${mealLabel} up`}
            className="min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-control text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronDownIcon size={14} className="rotate-180" />
            Move up
          </button>
          <button
            type="button"
            onClick={onMoveMealDown}
            disabled={!onMoveMealDown}
            aria-label={`Move ${mealLabel} down`}
            className="min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-control text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronDownIcon size={14} />
            Move down
          </button>
        </div>
      )}

      {showAddFood && (
        <FoodPickerModal
          foodOptions={foodOptions}
          onAdd={(foodDatabaseId, quantity) => {
            onAddFood(foodDatabaseId, quantity)
          }}
          onClose={() => setShowAddFood(false)}
          onFoodCreated={onFoodCreated}
          dailyTargets={dailyTargets}
          dailyTotals={dailyTotals}
        />
      )}
    </Card>
  )
}
