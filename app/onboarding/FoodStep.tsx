'use client'

import { useMemo, useState } from 'react'
import { CheckIcon, SearchIcon } from '@/components/ui/icons'

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
}

// Only shows a search box once a category has enough items that scanning the
// grid stops being faster than typing - purely a display filter, it never
// touches the selected-id list or the toggle logic passed in from
// OnboardingForm.
const SEARCH_THRESHOLD = 12

export default function FoodStep({ title, description, items, selected, onToggle }: Props) {
  const [query, setQuery] = useState('')

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
              className="w-full min-h-[44px] bg-background border border-border rounded-lg pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
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
                className={`min-h-[44px] px-4 py-3 rounded-lg border flex items-center justify-between gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isSelected
                    ? 'bg-primary/10 border-primary text-foreground'
                    : 'bg-background border-border text-foreground hover:border-muted-foreground'
                }`}
              >
                <span className="font-semibold text-left">{item.name}</span>
                {isSelected && (
                  <CheckIcon size={18} className="shrink-0 text-primary" />
                )}
              </button>
            )
          })}
        </div>
      ) : items.length === 0 ? (
        <div className="p-4 border border-error/30 bg-error/10 rounded-lg text-error text-sm">
          No options available. Please contact support.
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No matches for &quot;{query}&quot;.</p>
      )}
    </div>
  )
}
