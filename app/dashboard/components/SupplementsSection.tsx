'use client'

// Dashboard (and Settings) "Vitamins & Supplements" section - real,
// authenticated-user data only (spec section 7/15: no mock/fake rows, and a
// deliberately non-broken empty state). Full CRUD + notification toggle
// (spec section 8) via lib/supplements/actions.ts, and independently fires
// its own reminders via useSupplementReminders - never a second, unrelated
// notification system (spec section 9).

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PlusIcon } from '@/components/ui/icons'
import SupplementFormModal from '@/components/supplements/SupplementFormModal'
import SupplementListItem from '@/components/supplements/SupplementListItem'
import { emptySupplementFormValue, supplementDTOToFormValue, supplementFormValueToInput, type SupplementFormValue } from '@/components/supplements/types'
import {
  createSupplement,
  updateSupplement,
  deleteSupplement,
  toggleSupplementNotification,
  type SupplementDTO
} from '@/lib/supplements/actions'
import { useSupplementReminders } from '@/lib/notifications/useSupplementReminders'
import { useLocalDate } from '@/lib/tracking/useLocalDate'
import type { ReminderSupplement } from '@/lib/notifications/supplementSchedule'

type Props = {
  initialSupplements: SupplementDTO[]
}

export default function SupplementsSection({ initialSupplements }: Props) {
  const [supplements, setSupplements] = useState<SupplementDTO[]>(initialSupplements)
  const [modalMode, setModalMode] = useState<'add' | { editing: SupplementDTO } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const localDate = useLocalDate()

  const reminderSupplements: ReminderSupplement[] = supplements.map(s => ({
    id: s.id,
    name: s.name,
    dose: s.dose,
    doseUnit: s.doseUnit,
    quantity: s.quantity,
    quantityUnit: s.quantityUnit,
    times: s.times,
    notificationEnabled: s.notificationEnabled,
    startDate: s.startDate,
    endDate: s.endDate
  }))
  useSupplementReminders(reminderSupplements, localDate)

  const handleSave = async (value: SupplementFormValue) => {
    const input = supplementFormValueToInput(value)
    if (modalMode && typeof modalMode === 'object') {
      const result = await updateSupplement(modalMode.editing.id, input)
      if ('error' in result) return { error: result.error }
      setSupplements(prev => prev.map(s => (s.id === result.data.id ? result.data : s)))
    } else {
      const result = await createSupplement(input)
      if ('error' in result) return { error: result.error }
      setSupplements(prev => [...prev, result.data])
    }
    setModalMode(null)
  }

  const handleToggleNotification = async (id: string, enabled: boolean) => {
    const previous = supplements
    setSupplements(prev => prev.map(s => (s.id === id ? { ...s, notificationEnabled: enabled } : s)))
    const result = await toggleSupplementNotification(id, enabled)
    if ('error' in result) {
      setSupplements(previous)
      setError(result.error)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    const result = await deleteSupplement(id)
    setDeletingId(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSupplements(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-2xl font-bold text-foreground tracking-tight">Vitamins &amp; Supplements</h2>
        {supplements.length > 0 && (
          <Button size="sm" onClick={() => setModalMode('add')}>
            <PlusIcon size={16} /> Add supplement
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      )}

      {supplements.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <p className="text-sm font-semibold text-foreground">Keep track of your vitamins and supplements</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Add what you take and get reminders when it&apos;s time to take them.
          </p>
          <Button onClick={() => setModalMode('add')} className="mx-auto">
            <PlusIcon size={16} /> Add supplement
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {supplements.map(s => (
            <SupplementListItem
              key={s.id}
              supplement={s}
              deleting={deletingId === s.id}
              onToggleNotification={enabled => handleToggleNotification(s.id, enabled)}
              onEdit={() => setModalMode({ editing: s })}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}

      {modalMode && (
        <SupplementFormModal
          title={modalMode === 'add' ? 'Add a Supplement' : 'Edit Supplement'}
          submitLabel={modalMode === 'add' ? 'Add Supplement' : 'Save Changes'}
          initialValue={modalMode === 'add' ? emptySupplementFormValue() : supplementDTOToFormValue(modalMode.editing)}
          onSave={handleSave}
          onCancel={() => setModalMode(null)}
        />
      )}
    </div>
  )
}
