// Pure, framework-free vitamins & supplements validation/scheduling helpers -
// no Supabase, no 'use client'/'use server'. Mirrors the split already used
// for meal reminders (lib/notifications/schedule.ts is pure logic;
// lib/notifications/actions.ts is the DB-touching wrapper) - this is the one
// place shape/range validation for a supplement lives, imported by both the
// client-side form (for inline errors) and the server actions (the actual
// authority - see lib/supplements/actions.ts's own comment on why client
// validation alone is never trusted).

import { isValidReminderTime } from '@/lib/notifications/schedule'
import { isValidLocalDate } from '@/lib/tracking/date'

export type SupplementFrequency = 'once_daily' | 'twice_daily' | 'three_times_daily' | 'custom'

export const FREQUENCY_OPTIONS: { value: SupplementFrequency; label: string; timesCount: number | null }[] = [
  { value: 'once_daily', label: 'Once daily', timesCount: 1 },
  { value: 'twice_daily', label: 'Twice daily', timesCount: 2 },
  { value: 'three_times_daily', label: 'Three times daily', timesCount: 3 },
  { value: 'custom', label: 'Custom', timesCount: null }
]

const FREQUENCY_VALUES = FREQUENCY_OPTIONS.map(f => f.value)

// Suggestions only, offered via a <datalist> - never a closed enum. Per spec
// section 3, a user must be able to type any custom unit; these just save a
// keystroke for the common ones.
export const DOSE_UNIT_SUGGESTIONS = ['mg', 'mcg', 'g', 'IU', 'ml', 'capsule', 'tablet', 'scoop'] as const
export const QUANTITY_UNIT_SUGGESTIONS = ['capsule', 'tablet', 'scoop', 'ml', 'drop', 'gummy'] as const

const DEFAULT_TIMES_BY_FREQUENCY: Record<Exclude<SupplementFrequency, 'custom'>, string[]> = {
  once_daily: ['08:00'],
  twice_daily: ['08:00', '20:00'],
  three_times_daily: ['08:00', '14:00', '20:00']
}

// Resizes a times array to match a newly-chosen frequency, preserving
// whatever times the user already set for positions that still exist -
// exactly RemindersStep's own "resize on count change" pattern
// (app/onboarding/RemindersStep.tsx), reused here instead of reinvented.
export function defaultTimesForFrequency(frequency: SupplementFrequency, previous: string[]): string[] {
  if (frequency === 'custom') return previous.length > 0 ? previous : ['08:00']
  const defaults = DEFAULT_TIMES_BY_FREQUENCY[frequency]
  return defaults.map((fallback, i) => previous[i] ?? fallback)
}

export interface SupplementInput {
  name: string
  dose: number | null
  doseUnit: string | null
  quantity: number
  quantityUnit: string
  frequency: SupplementFrequency
  times: string[]
  startDate: string
  endDate: string | null
  notes: string | null
  notificationEnabled: boolean
}

const MAX_NAME_LENGTH = 200
const MAX_UNIT_LENGTH = 40
const MAX_NOTES_LENGTH = 2000

export type ValidationResult = { valid: true } | { valid: false; error: string }

// Single source of truth for "is this a submittable supplement" - called
// from both the client form (SupplementForm) for inline errors and from
// every server action (lib/supplements/actions.ts) as the actual
// authorization-independent authority. Never assumes the client already
// checked anything.
export function validateSupplementInput(input: SupplementInput): ValidationResult {
  const name = input.name.trim()
  if (name.length === 0) return { valid: false, error: 'Please enter a name for this supplement.' }
  if (name.length > MAX_NAME_LENGTH) return { valid: false, error: 'Name is too long.' }

  if (input.dose !== null) {
    if (!Number.isFinite(input.dose) || input.dose < 0) return { valid: false, error: 'Please enter a valid dose.' }
  }
  if (input.doseUnit !== null && input.doseUnit.length > MAX_UNIT_LENGTH) {
    return { valid: false, error: 'Dose unit is too long.' }
  }

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { valid: false, error: 'Please enter a valid quantity.' }
  }
  if (input.quantityUnit.trim().length === 0) return { valid: false, error: 'Please enter a quantity unit.' }
  if (input.quantityUnit.length > MAX_UNIT_LENGTH) return { valid: false, error: 'Quantity unit is too long.' }

  if (!FREQUENCY_VALUES.includes(input.frequency)) return { valid: false, error: 'Please choose a valid frequency.' }

  if (input.times.length === 0) return { valid: false, error: 'Please add at least one reminder time.' }
  if (input.times.some(t => !isValidReminderTime(t))) return { valid: false, error: 'One of the reminder times is invalid.' }

  if (!isValidLocalDate(input.startDate)) return { valid: false, error: 'Please choose a valid start date.' }
  if (input.endDate !== null) {
    if (!isValidLocalDate(input.endDate)) return { valid: false, error: 'Please choose a valid end date.' }
    if (input.endDate < input.startDate) return { valid: false, error: 'End date cannot be before the start date.' }
  }

  if (input.notes !== null && input.notes.length > MAX_NOTES_LENGTH) return { valid: false, error: 'Notes are too long.' }

  return { valid: true }
}
