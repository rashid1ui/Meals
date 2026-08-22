'use client'

import { useState } from 'react'
import type { ChangeEntry } from '@/lib/diet/diff'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { AlertIcon, ChevronDownIcon, CheckIcon } from '@/components/ui/icons'

function describeChange(change: ChangeEntry): { dotClass: string; text: string } {
  switch (change.type) {
    case 'meal-added':
      return { dotClass: 'bg-success', text: `New meal — ${change.mealName}` }
    case 'added':
      return { dotClass: 'bg-success', text: `Added — ${change.foodName} (${change.quantity}${change.unit}) to ${change.mealName}` }
    case 'removed':
      return { dotClass: 'bg-error', text: `Removed — ${change.foodName} (${change.quantity}${change.unit}) from ${change.mealName}` }
    case 'increased':
      return { dotClass: 'bg-warning', text: `Increased — ${change.foodName}: ${change.fromQuantity}${change.unit} → ${change.toQuantity}${change.unit}` }
    case 'decreased':
      return { dotClass: 'bg-warning', text: `Decreased — ${change.foodName}: ${change.fromQuantity}${change.unit} → ${change.toQuantity}${change.unit}` }
    case 'moved':
      return { dotClass: 'bg-muted-foreground', text: `Moved — ${change.foodName}: ${change.fromMealName} → ${change.toMealName}` }
  }
}

type Props = {
  changes: ChangeEntry[]
  canUndo: boolean
  hasChanges: boolean
  saving: boolean
  saveError: string | null
  justSaved?: boolean
  onUndo: () => void
  onDiscard: () => void
  onSave: () => void
}

export default function ChangeSummaryPanel({
  changes,
  canUndo,
  hasChanges,
  saving,
  saveError,
  justSaved = false,
  onUndo,
  onDiscard,
  onSave
}: Props) {
  const [expanded, setExpanded] = useState(false)

  // Nothing unsaved: the dashboard shouldn't look like it's waiting on a
  // save. Show a brief confirmation right after a successful save, otherwise
  // stay out of the way entirely - except Undo must stay reachable in the
  // rare case history still has entries even though the net diff is empty
  // (e.g. an edit that was manually reverted back to the original value).
  if (!hasChanges) {
    if (justSaved) {
      return (
        <div className="flex items-center gap-2 text-sm text-success" role="status">
          <CheckIcon size={16} />
          <span>Changes saved</span>
        </div>
      )
    }
    if (!canUndo) return null
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">No unsaved changes</span>
        <Button variant="ghost" size="sm" onClick={onUndo}>
          Undo
        </Button>
      </div>
    )
  }

  return (
    <Card className="p-4">
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-3 min-h-[44px] rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertIcon size={16} className="text-warning" />
          {changes.length} unsaved change{changes.length === 1 ? '' : 's'}
        </span>
        <ChevronDownIcon
          size={18}
          className={`text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <ul className="mt-3 pt-3 border-t border-border space-y-1.5 max-h-48 overflow-y-auto">
          {changes.map((change, idx) => {
            const { dotClass, text } = describeChange(change)
            return (
              <li key={idx} className="text-sm flex items-start gap-2">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
                <span className="text-muted-foreground">{text}</span>
              </li>
            )
          })}
        </ul>
      )}

      {saveError && (
        <div className="mt-3 flex items-start gap-2 p-3 text-sm text-error bg-error/10 border border-error/30 rounded-control">
          <AlertIcon size={16} className="shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
        <Button variant="secondary" size="sm" onClick={onUndo} disabled={!canUndo || saving}>
          Undo
        </Button>
        <Button variant="danger" size="sm" onClick={onDiscard} disabled={!hasChanges || saving}>
          Discard Changes
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={saving}
          disabled={!hasChanges || saving}
          className="sm:ml-auto"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </Card>
  )
}
