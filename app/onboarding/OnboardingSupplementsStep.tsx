'use client'

// Onboarding's optional "Vitamins & Supplements" step (spec section 6) -
// reuses the exact same SupplementForm/SupplementListItem the dashboard uses
// (components/supplements/), just operating on a local draft array instead
// of server actions - nothing is persisted until the wizard actually
// finishes (see OnboardingForm's handleFinishSupplements), same as every
// other onboarding step's draft-first approach.

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { PlusIcon, AlertIcon } from '@/components/ui/icons'
import SupplementForm from '@/components/supplements/SupplementForm'
import SupplementListItem from '@/components/supplements/SupplementListItem'
import Modal from '@/components/ui/Modal'
import { emptySupplementFormValue, supplementFormValueToInput, type SupplementFormValue } from '@/components/supplements/types'
import { validateSupplementInput } from '@/lib/supplements/validation'

type Props = {
  value: SupplementFormValue[]
  onChange: (value: SupplementFormValue[]) => void
}

export default function OnboardingSupplementsStep({ value, onChange }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<SupplementFormValue>(emptySupplementFormValue())
  const [error, setError] = useState<string | null>(null)

  const openAdd = () => {
    setDraft(emptySupplementFormValue())
    setError(null)
    setEditingIndex('new')
  }

  const openEdit = (index: number) => {
    setDraft(value[index])
    setError(null)
    setEditingIndex(index)
  }

  const closeModal = () => {
    setEditingIndex(null)
    setError(null)
  }

  const handleSaveDraft = () => {
    const validation = validateSupplementInput(supplementFormValueToInput(draft))
    if (!validation.valid) {
      setError(validation.error)
      return
    }
    if (editingIndex === 'new') {
      onChange([...value, draft])
    } else if (typeof editingIndex === 'number') {
      onChange(value.map((s, i) => (i === editingIndex ? draft : s)))
    }
    closeModal()
  }

  const handleDelete = (index: number) => onChange(value.filter((_, i) => i !== index))

  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Vitamins &amp; Supplements</h1>
        <p className="text-muted-foreground">
          Do you take any vitamins or supplements? Add them here to get reminders when it&apos;s time to take them -
          entirely optional, and you can always manage this later from your dashboard.
        </p>
      </div>

      {value.length > 0 && (
        <div className="space-y-3">
          {value.map((s, i) => (
            <SupplementListItem
              key={i}
              supplement={{
                id: String(i),
                name: s.name,
                dose: s.dose.trim() === '' ? null : parseFloat(s.dose),
                doseUnit: s.doseUnit.trim() || null,
                quantity: parseFloat(s.quantity) || 0,
                quantityUnit: s.quantityUnit,
                frequency: s.frequency,
                times: s.times,
                notificationEnabled: s.notificationEnabled
              }}
              onToggleNotification={enabled => onChange(value.map((item, idx) => (idx === i ? { ...item, notificationEnabled: enabled } : item)))}
              onEdit={() => openEdit(i)}
              onDelete={() => handleDelete(i)}
            />
          ))}
        </div>
      )}

      <Button variant="secondary" onClick={openAdd} className="w-full">
        <PlusIcon size={16} /> Add supplement
      </Button>

      {editingIndex !== null && (
        <Modal onClose={closeModal} labelledBy="onboarding-supplement-form-title" sheet>
          <h3 id="onboarding-supplement-form-title" className="font-display text-2xl font-bold text-foreground mb-6">
            {editingIndex === 'new' ? 'Add a Supplement' : 'Edit Supplement'}
          </h3>

          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
              <AlertIcon size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <SupplementForm value={draft} onChange={setDraft} />

          <div className="flex gap-4 pt-6">
            <Button variant="secondary" onClick={closeModal} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveDraft} className="flex-1">
              {editingIndex === 'new' ? 'Add Supplement' : 'Save Changes'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
