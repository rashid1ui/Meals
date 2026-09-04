'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { AlertIcon } from '@/components/ui/icons'
import SupplementForm from './SupplementForm'
import { supplementFormValueToInput } from './types'
import { validateSupplementInput } from '@/lib/supplements/validation'
import type { SupplementFormValue } from './types'

type Props = {
  title: string
  initialValue: SupplementFormValue
  submitLabel: string
  onSave: (value: SupplementFormValue) => Promise<{ error: string } | void>
  onCancel: () => void
}

// Shared add/edit shell over SupplementForm - used by the dashboard
// (SupplementsSection). Validates client-side first purely for a fast inline
// error (lib/supplements/validation.ts is the same function the server
// action re-runs as the actual authority - see lib/supplements/actions.ts).
export default function SupplementFormModal({ title, initialValue, submitLabel, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const input = supplementFormValueToInput(value)
    const validation = validateSupplementInput(input)
    if (!validation.valid) {
      setError(validation.error)
      return
    }
    setSaving(true)
    setError(null)
    const result = await onSave(value)
    setSaving(false)
    if (result && 'error' in result) setError(result.error)
  }

  return (
    <Modal onClose={onCancel} labelledBy="supplement-form-title" sheet>
      <h3 id="supplement-form-title" className="font-display text-2xl font-bold text-foreground mb-6">
        {title}
      </h3>

      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 text-sm text-error bg-error/10 border border-error/30 rounded-control">
          <AlertIcon size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <SupplementForm value={value} onChange={setValue} />

      <div className="flex gap-4 pt-6">
        <Button variant="secondary" onClick={onCancel} disabled={saving} className="flex-1">
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} loading={saving} className="flex-1">
          {submitLabel}
        </Button>
      </div>
    </Modal>
  )
}
