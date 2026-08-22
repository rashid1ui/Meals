'use client'

import { useMemo, useState } from 'react'
import { CheckIcon, SearchIcon, PlusIcon } from '@/components/ui/icons'
import CreateFoodForm from '@/components/food/CreateFoodForm'
import type { CreateFoodInput } from '@/app/dashboard/food-actions'
import type { FoodOption } from '@/app/dashboard/components/DietEditor'
import { getFoodEmoji } from '@/lib/food/foodEmojiMap'

type Food = {
  id: string
  name: string
  category: string
}

type Props = {
  title: string
  description: string
  items: Food[]
  selected: string[]
  onToggle: (id: string) => void
  defaultCategory: CreateFoodInput['category']
  onFoodCreated: (food: FoodOption) => void
}

// Only shows a search box once a category has enough items that scanning the
// grid stops being faster than typing - purely a display filter, it never
// touches the selected-id list or the toggle logic passed in from
// OnboardingForm.
const SEARCH_THRESHOLD = 12

export default function FoodStep({ title, description, items, selected, onToggle, defaultCategory, onFoodCreated }: Props) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const visibleItems = useMemo(() => {
    if (!query.trim()) return items
    const q = query.trim().toLowerCase()
    return items.filter(item => item.name.toLowerCase().includes(q))
  }, [items, query])

  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted-foreground">
          {selected.length} selected
        </span>
        {items.length > SEARCH_THRESHOLD && (
          <div className="relative w-48">
            <SearchIcon
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search"
              aria-label={`Search ${title.toLowerCase()}`}
              className="w-full min-h-[44px] bg-background border border-border rounded-control pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
            />
          </div>
        )}
      </div>

      {visibleItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleItems.map(item => {
            const isSelected = selected.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggle(item.id)}
                className={`min-h-[44px] px-4 py-3 rounded-control border flex items-center justify-between gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isSelected
                    ? 'bg-primary/10 border-primary text-foreground'
                    : 'bg-background border-border text-foreground hover:border-muted-foreground'
                }`}
              >
                <span className="font-semibold text-left flex items-center gap-2 min-w-0">
                  <span aria-hidden="true" className="text-lg leading-none shrink-0">
                    {getFoodEmoji(item.name)}
                  </span>
                  <span className="min-w-0">{item.name}</span>
                </span>
                {isSelected && (
                  <CheckIcon size={18} className="shrink-0 text-primary" />
                )}
              </button>
            )
          })}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No foods in this category yet - add your own below.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No matches for &quot;{query}&quot;.</p>
      )}

      {creating ? (
        <CreateFoodForm
          defaultCategory={defaultCategory}
          title="Add Custom Food"
          description="Not limited to the list above - this is saved to your food catalog and available to the AI for this and future meal plans."
          onCreated={food => {
            onFoodCreated(food)
            setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full min-h-[44px] px-4 py-3 rounded-control border border-dashed border-primary/50 flex items-center justify-center gap-2 text-primary font-semibold text-sm hover:bg-primary/10 hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <PlusIcon size={16} />
          Add Custom Food
        </button>
      )}
    </div>
  )
}
