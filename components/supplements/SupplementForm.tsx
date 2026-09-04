'use client'

// Shared, controlled form for creating/editing a vitamin or supplement -
// used identically by the dashboard (SupplementFormModal) and onboarding
// (OnboardingSupplementsStep), each wrapping it in its own shell (a Modal on
// the dashboard, an inline card during onboarding). Free text everywhere a
// unit is involved (spec section 3: "do not hard-code the system so only
// these units are possible") - DOSE_UNIT_SUGGESTIONS/QUANTITY_UNIT_SUGGESTIONS
// are offered via <datalist> only, never a closed <select>.

import Input from '@/components/ui/Input'
import { ChevronDownIcon, PlusIcon, CloseIcon } from '@/components/ui/icons'
import {
  FREQUENCY_OPTIONS,
  DOSE_UNIT_SUGGESTIONS,
  QUANTITY_UNIT_SUGGESTIONS,
  defaultTimesForFrequency,
  type SupplementFrequency
} from '@/lib/supplements/validation'
import type { SupplementFormValue } from './types'

type Props = {
  value: SupplementFormValue
  onChange: (value: SupplementFormValue) => void
}

export default function SupplementForm({ value, onChange }: Props) {
  const setField = <K extends keyof SupplementFormValue>(key: K, val: SupplementFormValue[K]) =>
    onChange({ ...value, [key]: val })

  const handleFrequencyChange = (frequency: SupplementFrequency) => {
    onChange({ ...value, frequency, times: defaultTimesForFrequency(frequency, value.times) })
  }

  const setTime = (index: number, time: string) => {
    onChange({ ...value, times: value.times.map((t, i) => (i === index ? time : t)) })
  }

  const addTime = () => onChange({ ...value, times: [...value.times, '12:00'] })
  const removeTime = (index: number) => onChange({ ...value, times: value.times.filter((_, i) => i !== index) })

  return (
    <div className="space-y-4">
      <Input
        label="Supplement name"
        autoFocus
        value={value.name}
        onChange={e => setField('name', e.target.value)}
        placeholder="e.g. Vitamin D3"
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex gap-2 items-end">
          <Input
            label="Dose"
            type="number"
            numeric
            min="0"
            step="any"
            value={value.dose}
            onChange={e => setField('dose', e.target.value)}
            placeholder="5000"
            className="flex-1"
          />
          <input
            list="supplement-dose-units"
            aria-label="Dose unit"
            value={value.doseUnit}
            onChange={e => setField('doseUnit', e.target.value)}
            placeholder="IU"
            className="w-20 min-h-[44px] bg-background border border-border rounded-control px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
          />
        </div>

        <div className="flex gap-2 items-end">
          <Input
            label="Amount"
            type="number"
            numeric
            min="0"
            step="any"
            value={value.quantity}
            onChange={e => setField('quantity', e.target.value)}
            placeholder="1"
            className="flex-1"
          />
          <input
            list="supplement-quantity-units"
            aria-label="Amount unit"
            value={value.quantityUnit}
            onChange={e => setField('quantityUnit', e.target.value)}
            placeholder="capsule"
            className="w-24 min-h-[44px] bg-background border border-border rounded-control px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
          />
        </div>
      </div>

      <datalist id="supplement-dose-units">
        {DOSE_UNIT_SUGGESTIONS.map(u => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="supplement-quantity-units">
        {QUANTITY_UNIT_SUGGESTIONS.map(u => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="space-y-2">
        <label htmlFor="supplement-frequency" className="text-sm font-semibold text-foreground block">
          How often?
        </label>
        <div className="relative">
          <select
            id="supplement-frequency"
            value={value.frequency}
            onChange={e => handleFrequencyChange(e.target.value as SupplementFrequency)}
            className="w-full min-h-[44px] appearance-none bg-background border border-border rounded-control px-4 py-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors cursor-pointer"
          >
            {FREQUENCY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground block">Reminder time{value.times.length > 1 ? 's' : ''}</span>
        <div className="space-y-2">
          {value.times.map((time, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="time"
                aria-label={`Reminder time ${i + 1}`}
                value={time}
                onChange={e => setTime(i, e.target.value)}
                className="flex-1 min-h-[44px] bg-background border border-border rounded-control px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
              />
              {value.frequency === 'custom' && value.times.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTime(i)}
                  aria-label={`Remove reminder time ${i + 1}`}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-error rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <CloseIcon size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        {value.frequency === 'custom' && (
          <button
            type="button"
            onClick={addTime}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            <PlusIcon size={14} /> Add another time
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="supplement-start-date" className="text-sm font-semibold text-foreground block">
            Start date
          </label>
          <input
            id="supplement-start-date"
            type="date"
            value={value.startDate}
            onChange={e => setField('startDate', e.target.value)}
            className="w-full min-h-[44px] bg-background border border-border rounded-control px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="supplement-end-date" className="text-sm font-semibold text-foreground block">
            End date <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="supplement-end-date"
            type="date"
            value={value.endDate}
            min={value.startDate}
            onChange={e => setField('endDate', e.target.value)}
            className="w-full min-h-[44px] bg-background border border-border rounded-control px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="supplement-notes" className="text-sm font-semibold text-foreground block">
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="supplement-notes"
          value={value.notes}
          onChange={e => setField('notes', e.target.value)}
          placeholder="e.g. Take after breakfast"
          rows={2}
          className="w-full bg-background border border-border rounded-control px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors resize-none"
        />
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value.notificationEnabled}
          onChange={e => setField('notificationEnabled', e.target.checked)}
          className="w-5 h-5 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        />
        <span className="text-sm font-semibold text-foreground">🔔 Remind me</span>
      </label>
    </div>
  )
}
