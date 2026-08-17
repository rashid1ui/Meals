'use client'

import type { ChangeEntry } from '@/lib/diet/diff'

function describeChange(change: ChangeEntry): { symbol: string; color: string; text: string } {
  switch (change.type) {
    case 'meal-added':
      return { symbol: '+', color: 'text-green-400', text: `New meal — ${change.mealName}` }
    case 'added':
      return { symbol: '+', color: 'text-green-400', text: `Added — ${change.foodName} (${change.quantity}${change.unit}) to ${change.mealName}` }
    case 'removed':
      return { symbol: '−', color: 'text-red-400', text: `Removed — ${change.foodName} (${change.quantity}${change.unit}) from ${change.mealName}` }
    case 'increased':
      return { symbol: '↑', color: 'text-blue-400', text: `Increased — ${change.foodName}: ${change.fromQuantity}${change.unit} → ${change.toQuantity}${change.unit}` }
    case 'decreased':
      return { symbol: '↓', color: 'text-orange-400', text: `Decreased — ${change.foodName}: ${change.fromQuantity}${change.unit} → ${change.toQuantity}${change.unit}` }
    case 'moved':
      return { symbol: '⇄', color: 'text-purple-400', text: `Moved — ${change.foodName}: ${change.fromMealName} → ${change.toMealName}` }
  }
}

type Props = {
  changes: ChangeEntry[]
  canUndo: boolean
  hasChanges: boolean
  saving: boolean
  saveError: string | null
  onUndo: () => void
  onDiscard: () => void
  onSave: () => void
}

export default function ChangeSummaryPanel({ changes, canUndo, hasChanges, saving, saveError, onUndo, onDiscard, onSave }: Props) {
  return (
    <div className="bg-[#161B22] border border-gray-800 rounded-3xl p-6 shadow-xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Changes</h2>
          <p className="text-sm text-gray-500">
            {hasChanges ? `${changes.length} unsaved change${changes.length === 1 ? '' : 's'}` : 'No unsaved changes'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo || saving}
            className="px-4 py-2 text-sm bg-[#0B0E14] border border-gray-700 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-semibold transition-all"
          >
            Undo
          </button>
          <button
            onClick={onDiscard}
            disabled={!hasChanges || saving}
            className="px-4 py-2 text-sm bg-[#0B0E14] border border-gray-700 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-semibold transition-all"
          >
            Discard Changes
          </button>
          <button
            onClick={onSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mt-4 p-3 text-sm text-red-200 bg-red-900/40 border border-red-500/30 rounded-xl">
          {saveError}
        </div>
      )}

      {hasChanges && (
        <ul className="mt-4 space-y-1.5">
          {changes.map((change, idx) => {
            const { symbol, color, text } = describeChange(change)
            return (
              <li key={idx} className="text-sm flex items-start gap-2">
                <span className={`font-bold ${color}`}>{symbol}</span>
                <span className="text-gray-300">{text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
