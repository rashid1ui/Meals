'use client'

// Dashboard/Settings supplement row WITH daily dose tracking (spec sections
// 7/8) - a supplement is only "completed" when the user explicitly marks
// each scheduled dose taken, never merely because it exists or has a
// reminder enabled. A supplement with N scheduled times renders N
// independent Taken/Take controls, never one checkbox for the whole
// supplement (section 8). Distinct from the plain SupplementListItem
// (which onboarding uses, before any real tracking exists yet).

import { useState } from 'react'
import { PillIcon, ChevronRightIcon } from '@/components/ui/icons'
import { formatDoseAndQuantity, formatTime12h } from './format'
import type { SupplementFrequency } from '@/lib/supplements/validation'

export interface SupplementTrackingCardData {
  id: string
  name: string
  dose: number | null
  doseUnit: string | null
  quantity: number
  quantityUnit: string
  frequency: SupplementFrequency
  notificationEnabled: boolean
}

export interface DoseRow {
  scheduledTime: string
  completed: boolean
}

type Props = {
  supplement: SupplementTrackingCardData
  doses: DoseRow[]
  onToggleDose: (scheduledTime: string, completed: boolean) => void
  onToggleNotification: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
  deleting?: boolean
}

export default function SupplementTrackingCard({
  supplement,
  doses,
  onToggleDose,
  onToggleNotification,
  onEdit,
  onDelete,
  deleting = false
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const sortedDoses = [...doses].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))

  return (
    <div className="p-4 rounded-control border border-border space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <PillIcon size={18} />
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="text-left min-w-0 flex-1 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {supplement.name}
            <ChevronRightIcon size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{formatDoseAndQuantity(supplement)}</div>
        </button>

        <button
          type="button"
          onClick={() => onToggleNotification(!supplement.notificationEnabled)}
          aria-pressed={supplement.notificationEnabled}
          aria-label={
            supplement.notificationEnabled ? `Turn off reminders for ${supplement.name}` : `Turn on reminders for ${supplement.name}`
          }
          title={supplement.notificationEnabled ? 'Notifications on' : 'Notifications off'}
          className={`shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            supplement.notificationEnabled ? 'text-primary' : 'text-muted-foreground opacity-40 hover:opacity-70'
          }`}
        >
          🔔
        </button>
      </div>

      {sortedDoses.length > 0 && (
        <div className="pl-12 space-y-2">
          {sortedDoses.map(dose => (
            <div key={dose.scheduledTime} className="flex items-center justify-between gap-3">
              <span className="font-mono tabular-nums text-sm text-foreground">{formatTime12h(dose.scheduledTime)}</span>
              <button
                type="button"
                onClick={() => onToggleDose(dose.scheduledTime, !dose.completed)}
                aria-pressed={dose.completed}
                aria-label={
                  dose.completed
                    ? `Mark ${supplement.name} at ${formatTime12h(dose.scheduledTime)} as not taken`
                    : `Mark ${supplement.name} at ${formatTime12h(dose.scheduledTime)} as taken`
                }
                className={`min-h-[36px] px-3.5 rounded-pill text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  dose.completed
                    ? 'bg-success/15 text-success border border-success/30 hover:bg-success/25'
                    : 'bg-surface-elevated text-muted-foreground border border-border hover:border-primary hover:text-primary'
                }`}
              >
                {dose.completed ? '✓ Taken' : '○ Take'}
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmingDelete ? (
        <div className="flex items-center gap-3 pl-12 text-xs">
          <span className="text-foreground font-semibold">Delete this supplement?</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="font-bold text-error hover:underline disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
            className="font-semibold text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="pl-12">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-xs font-semibold text-muted-foreground hover:text-error transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
