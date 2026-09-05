'use client'

// Purely presentational, callback-driven display row for one supplement -
// shared by the dashboard (server-backed callbacks) and onboarding (local
// array mutations), per the project's "do not duplicate components"
// convention. Never talks to Supabase/server actions itself.

import { useState } from 'react'
import { PillIcon, ChevronRightIcon } from '@/components/ui/icons'
import StoredImageThumb from '@/components/images/StoredImageThumb'
import { formatDoseAndQuantity, formatSchedule } from './format'
import type { SupplementFrequency } from '@/lib/supplements/validation'
import type { FoodImageAttribution } from '@/lib/food/foodImage'

export interface SupplementListItemData {
  id: string
  name: string
  dose: number | null
  doseUnit: string | null
  quantity: number
  quantityUnit: string
  frequency: SupplementFrequency
  times: string[]
  notificationEnabled: boolean
  imageUrl?: string | null
  imageAlt?: string | null
  imageAttribution?: FoodImageAttribution | null
}

type Props = {
  supplement: SupplementListItemData
  onToggleNotification: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
  deleting?: boolean
}

export default function SupplementListItem({ supplement, onToggleNotification, onEdit, onDelete, deleting = false }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="p-4 rounded-control border border-border flex items-start gap-3">
      <StoredImageThumb
        image={{ image_url: supplement.imageUrl, image_alt: supplement.imageAlt, image_attribution: supplement.imageAttribution }}
        fallback={<span className="text-primary"><PillIcon size={18} /></span>}
        fallbackAlt={`Photo of ${supplement.name}`}
        sizeClassName="w-9 h-9"
        className="rounded-full mt-0.5"
      />

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className="text-left w-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {supplement.name}
            <ChevronRightIcon size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{formatDoseAndQuantity(supplement)}</div>
          <div className="text-xs text-muted-foreground">{formatSchedule(supplement.frequency, supplement.times)}</div>
        </button>

        {confirmingDelete ? (
          <div className="flex items-center gap-3 mt-3 text-xs">
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
          <div className="flex items-center gap-4 mt-3">
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

      <button
        type="button"
        onClick={() => onToggleNotification(!supplement.notificationEnabled)}
        aria-pressed={supplement.notificationEnabled}
        aria-label={supplement.notificationEnabled ? `Turn off reminders for ${supplement.name}` : `Turn on reminders for ${supplement.name}`}
        title={supplement.notificationEnabled ? 'Notifications on' : 'Notifications off'}
        className={`shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          supplement.notificationEnabled ? 'text-primary' : 'text-muted-foreground opacity-40 hover:opacity-70'
        }`}
      >
        🔔
      </button>
    </div>
  )
}
