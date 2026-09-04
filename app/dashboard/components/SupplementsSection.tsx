'use client'

// Dashboard (and Settings) "Vitamins & Supplements" section - real,
// authenticated-user data only (spec section 7/15: no mock/fake rows, and a
// deliberately non-broken empty state). Full CRUD + notification toggle via
// lib/supplements/actions.ts, PLUS daily dose completion (taken/not taken)
// via the shared SupplementsTrackingProvider - the same source the
// Dashboard's top-level SupplementProgressCard reads, so marking a dose here
// updates that card immediately, with no reload and no second, competing
// percentage. Independently fires its own reminders via
// useSupplementReminders - never a second, unrelated notification system.

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { PlusIcon } from '@/components/ui/icons'
import SupplementFormModal from '@/components/supplements/SupplementFormModal'
import SupplementTrackingCard from '@/components/supplements/SupplementTrackingCard'
import { emptySupplementFormValue, supplementDTOToFormValue, supplementFormValueToInput, type SupplementFormValue } from '@/components/supplements/types'
import {
  createSupplement,
  updateSupplement,
  deleteSupplement,
  toggleSupplementNotification,
  type SupplementDTO
} from '@/lib/supplements/actions'
import { useSupplementReminders } from '@/lib/notifications/useSupplementReminders'
import { useSupplementsTracking } from '@/lib/supplements/SupplementsTrackingProvider'
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
  const { summary: trackingSummary, toggleDose, refresh: refreshTracking } = useSupplementsTracking()

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

  const dosesBySupplementId = new Map<string, { scheduledTime: string; completed: boolean }[]>()
  for (const dose of trackingSummary?.doses ?? []) {
    const list = dosesBySupplementId.get(dose.supplementId) ?? []
    list.push({ scheduledTime: dose.scheduledTime, completed: dose.completed })
    dosesBySupplementId.set(dose.supplementId, list)
  }

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
    // A create/edit can change what's due TODAY (new times, a shifted
    // start/end date) - refresh the shared tracking summary so the
    // Dashboard's progress card and this section's dose controls reflect it
    // immediately, without waiting for the next natural refetch.
    void refreshTracking()
  }

  const handleToggleNotification = async (id: string, enabled: boolean) => {
    const previous = supplements
    setSupplements(prev => prev.map(s => (s.id === id ? { ...s, notificationEnabled: enabled } : s)))
    const result = await toggleSupplementNotification(id, enabled)
    if ('error' in result) {
      setSupplements(previous)
      setError(result.error)
    }
    // Deliberately NOT refreshing tracking here - notification_enabled has
    // no bearing on today's target or completion (spec section 15).
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
    void refreshTracking()
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
            <SupplementTrackingCard
              key={s.id}
              supplement={s}
              doses={dosesBySupplementId.get(s.id) ?? []}
              deleting={deletingId === s.id}
              onToggleDose={(scheduledTime, completed) => toggleDose(s.id, scheduledTime, completed)}
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
