'use client'

import { useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import CreateFoodForm from '@/components/food/CreateFoodForm'
import { calculateFoodMacros, isValidQuantity } from '@/lib/nutrition/calculator'
import { toCanonicalGrams, requiresGramsPerUnit, unitLabel, type UnitConfig } from '@/lib/nutrition/units'
import { servingDisplayFor } from '@/lib/food/servingDisplay'
import { searchFoods } from '@/lib/food/search'
import type { MacroTotals } from '@/lib/diet/diff'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'
import { SearchIcon, PlusIcon, CloseIcon, ChevronLeftIcon } from '@/components/ui/icons'

type CategoryTabKey = 'protein' | 'carbs' | 'fats' | 'produce' | 'supplements'

// 'produce' covers both 'fruit' and 'vegetable' food_database categories
// under one combined tab label - the two are nutritionally similar enough
// (and few enough in the catalog) not to need separate tabs.
const CATEGORY_TABS: { key: CategoryTabKey; label: string; matches: (category: string | null | undefined) => boolean }[] = [
  { key: 'protein', label: 'Protein', matches: c => c === 'protein' || c === 'dairy' },
  { key: 'carbs', label: 'Carbs', matches: c => c === 'carbohydrate' },
  { key: 'fats', label: 'Fats', matches: c => c === 'fat' },
  { key: 'produce', label: 'Vegetables & Fruits', matches: c => c === 'fruit' || c === 'vegetable' },
  { key: 'supplements', label: 'Supplements', matches: c => c === 'supplement' }
]

const CREATE_FORM_DEFAULT_CATEGORY: Record<CategoryTabKey, 'protein' | 'carbohydrate' | 'fat' | 'fruit' | 'supplement'> = {
  protein: 'protein',
  carbs: 'carbohydrate',
  fats: 'fat',
  produce: 'fruit',
  supplements: 'supplement'
}

function categoryBadgeVariant(category: string | null | undefined): 'protein' | 'carbs' | 'fat' | 'success' | 'neutral' {
  if (category === 'protein' || category === 'dairy') return 'protein'
  if (category === 'carbohydrate') return 'carbs'
  if (category === 'fat') return 'fat'
  if (category === 'fruit' || category === 'vegetable') return 'success'
  return 'neutral'
}

function categoryLabel(category: string | null | undefined): string {
  switch (category) {
    case 'protein':
      return 'Protein'
    case 'dairy':
      return 'Dairy'
    case 'carbohydrate':
      return 'Carbs'
    case 'fat':
      return 'Fat'
    case 'fruit':
      return 'Fruit'
    case 'vegetable':
      return 'Vegetable'
    case 'supplement':
      return 'Supplement'
    default:
      return category || 'Food'
  }
}

function unitConfigFor(food: FoodOption): UnitConfig {
  return { displayUnit: food.display_unit || 'g', gramsPerDisplayUnit: food.grams_per_display_unit || 1 }
}

const MACRO_ROWS: { key: keyof MacroTotals; label: string; colorClass: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', colorClass: 'text-calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', colorClass: 'text-protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', colorClass: 'text-carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', colorClass: 'text-fat', unit: 'g' }
]

type Props = {
  foodOptions: FoodOption[]
  onAdd: (foodDatabaseId: string, quantity: number) => void
  onClose: () => void
  // Lets the parent add a newly-created food to its own lookup list
  // immediately, without a page refresh - same contract as AddFoodPopover.
  onFoodCreated?: (food: FoodOption) => void
  // Both optional - call sites that don't pass them (e.g. no daily targets
  // computed yet) simply skip the guidance strip.
  dailyTargets?: MacroTotals
  dailyTotals?: MacroTotals
}

export default function FoodPickerModal({ foodOptions, onAdd, onClose, onFoodCreated, dailyTargets, dailyTotals }: Props) {
  const [mode, setMode] = useState<'browse' | 'create'>('browse')
  const [activeCategory, setActiveCategory] = useState<CategoryTabKey>('protein')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<FoodOption | null>(null)
  const [quantity, setQuantity] = useState('100')

  const activeTab = CATEGORY_TABS.find(t => t.key === activeCategory)!

  // A non-empty query searches the ENTIRE catalog, not just the active tab -
  // typing "banana" while the Protein tab happens to be selected must still
  // find it. With no query, the tab filter alone decides what's shown.
  const results = useMemo(() => {
    if (query.trim()) return searchFoods(foodOptions, query)
    return foodOptions.filter(f => activeTab.matches(f.category))
  }, [foodOptions, activeTab, query])

  const parsedQuantity = parseFloat(quantity)
  const unitConfig = selected ? unitConfigFor(selected) : null
  const canonicalGrams =
    unitConfig && isFinite(parsedQuantity) && parsedQuantity > 0 ? toCanonicalGrams(parsedQuantity, unitConfig) : null
  // Same bound the server enforces (lib/nutrition/calculator.ts's
  // isValidQuantity, via lib/diet/save-plan.ts's resolveMeal) - checked
  // here too so an out-of-range quantity is caught immediately, with the
  // specific food named, instead of only failing much later at final
  // "Create Plan"/"Save" with a generic error unattributed to any one item.
  const quantityOutOfRange =
    selected !== null && canonicalGrams !== null && !isValidQuantity(canonicalGrams, selected.serving_unit)
  const preview = selected && canonicalGrams !== null && !quantityOutOfRange ? calculateFoodMacros(canonicalGrams, selected) : null

  const selectFood = (food: FoodOption) => {
    setSelected(food)
    const isPieceLike = requiresGramsPerUnit(food.display_unit || 'g')
    setQuantity(isPieceLike ? '1' : '100')
  }

  const backToBrowse = () => {
    setSelected(null)
  }

  const handleAdd = (addAnother: boolean) => {
    if (!selected || canonicalGrams === null) return
    onAdd(selected.id, canonicalGrams)
    if (addAnother) {
      setSelected(null)
    } else {
      onClose()
    }
  }

  if (mode === 'create') {
    return (
      <Modal onClose={onClose} labelledBy="food-picker-title" size="lg" sheet>
        {/* CreateFoodForm renders its own visible title but no id - this
            gives aria-labelledby a real target to point to without
            duplicating a second visible heading. */}
        <h3 id="food-picker-title" className="sr-only">
          Add a New Food
        </h3>
        <CreateFoodForm
          title="Add a New Food"
          description="This adds a shared food available to all your future meals."
          defaultCategory={CREATE_FORM_DEFAULT_CATEGORY[activeCategory]}
          onCreated={food => {
            onFoodCreated?.(food)
            setMode('browse')
            selectFood(food)
          }}
          onCancel={() => setMode('browse')}
        />
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} labelledBy="food-picker-title" size="lg" sheet>
      <div className="flex items-center justify-between mb-4">
        <h3 id="food-picker-title" className="font-display text-xl font-bold text-foreground">
          {selected ? selected.name : 'Add Food'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {!selected ? (
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Food categories">
            {CATEGORY_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeCategory === tab.key}
                onClick={() => setActiveCategory(tab.key)}
                className={`shrink-0 min-h-[44px] px-3.5 rounded-control border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activeCategory === tab.key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-foreground hover:bg-surface-elevated'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search all foods..."
              aria-label="Search all foods"
              className="w-full min-h-[44px] bg-background border border-border rounded-control pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto">
              {results.map(food => {
                const display = servingDisplayFor(food)
                return (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => selectFood(food)}
                    className="text-left p-3 rounded-control border border-border bg-surface hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-foreground">{food.name}</span>
                      <Badge variant={categoryBadgeVariant(food.category)} className="shrink-0">
                        {categoryLabel(food.category)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 font-mono tabular-nums text-xs font-semibold">
                      <span className="text-calories">{Math.round(display.calories)} kcal</span>
                      <span className="text-protein">{Math.round(display.protein)}p</span>
                      <span className="text-carbs">{Math.round(display.carbs)}c</span>
                      <span className="text-fat">{Math.round(display.fat)}f</span>
                    </div>
                    <span className="block text-[11px] text-muted-foreground">{display.label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {query.trim() ? `No foods match "${query}".` : `No foods in ${activeTab.label} yet.`}
            </p>
          )}

          <button
            type="button"
            onClick={() => setMode('create')}
            className="min-h-[44px] inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-strong transition-colors rounded-control px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <PlusIcon size={14} />
            Can&apos;t find it? Add a new food
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={backToBrowse}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-h-[44px] -mt-2"
          >
            <ChevronLeftIcon size={14} />
            Change food
          </button>

          <div className="flex items-center gap-2">
            <input
              type="number"
              autoFocus
              step={requiresGramsPerUnit(selected.display_unit || 'g') ? 0.5 : 1}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              aria-label={`Quantity in ${unitLabel(selected.display_unit || 'g', parsedQuantity || 0)}`}
              className="w-24 min-h-[44px] text-center bg-background border border-border rounded-control text-sm font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="text-sm font-semibold text-foreground">
              {unitLabel(selected.display_unit || 'g', parsedQuantity || 0)}
            </span>
          </div>

          {quantityOutOfRange && (
            <p className="text-xs text-error" role="alert">
              That quantity is outside the allowed range for {selected.name}. Please enter a smaller amount.
            </p>
          )}

          {preview && (
            <div className="flex flex-wrap gap-4 font-mono tabular-nums text-sm font-semibold">
              <span className="text-foreground/70">{Math.round(preview.calories)} kcal</span>
              <span className="text-protein">{Math.round(preview.protein)}p</span>
              <span className="text-carbs">{Math.round(preview.carbs)}c</span>
              <span className="text-fat">{Math.round(preview.fat)}f</span>
            </div>
          )}

          {dailyTargets && dailyTotals && (
            <div className="p-3 rounded-control border border-border bg-surface-elevated space-y-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Daily Progress</span>
              <div className="space-y-1">
                {MACRO_ROWS.map(row => (
                  <div key={row.key} className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className={`font-semibold ${row.colorClass}`}>{row.label}</span>
                    <span className="text-foreground">
                      {Math.round(dailyTotals[row.key])}
                      {preview && (
                        <span className="text-muted-foreground"> +{Math.round(preview[row.key])}</span>
                      )}
                      {' / '}
                      {Math.round(dailyTargets[row.key])} {row.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleAdd(true)} disabled={!preview} className="flex-1">
              Add &amp; Add Another
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleAdd(false)} disabled={!preview} className="flex-1">
              Add to Meal
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
