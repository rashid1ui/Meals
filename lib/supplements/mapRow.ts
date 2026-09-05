// Pure row <-> DTO mapping shared between lib/supplements/actions.ts (CRUD)
// and lib/supplements/trackingActions.ts (daily dose tracking) - kept out of
// actions.ts itself because a 'use server' file may only export async
// functions; every non-action helper it needs lives here instead.

import type { SupplementInput, SupplementFrequency } from './validation'
import type { FoodImageAttribution } from '@/lib/food/foodImage'

export interface SupplementDTO {
  id: string
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
  // Presentation-only (migration 0030). Null until the image resolver
  // (lib/images/*) assigns one; the UI shows the pill icon fallback.
  imageUrl: string | null
  imageAlt: string | null
  imageAttribution: FoodImageAttribution | null
}

export interface SupplementRow {
  id: string
  name: string
  dose: number | string | null
  dose_unit: string | null
  quantity: number | string
  quantity_unit: string
  frequency: string
  times: string[] | null
  start_date: string
  end_date: string | null
  notes: string | null
  notification_enabled: boolean
  image_url?: string | null
  image_alt?: string | null
  image_attribution?: FoodImageAttribution | null
}

export const SUPPLEMENT_SELECT_COLUMNS =
  'id, name, dose, dose_unit, quantity, quantity_unit, frequency, times, start_date, end_date, notes, notification_enabled, image_url, image_alt, image_attribution'

// Postgres `time` values round-trip as "HH:MM:SS" - trimmed to "HH:MM" here,
// exactly like lib/notifications/actions.ts already does for
// meals.reminder_time, so every layer above this one only ever sees the
// wall-clock format isValidReminderTime/isMealReminderDue/isSupplementActiveOn
// expect.
export function rowToDTO(row: SupplementRow): SupplementDTO {
  return {
    id: row.id,
    name: row.name,
    dose: row.dose === null ? null : Number(row.dose),
    doseUnit: row.dose_unit,
    quantity: Number(row.quantity),
    quantityUnit: row.quantity_unit,
    frequency: row.frequency as SupplementFrequency,
    times: (row.times || []).map(t => String(t).slice(0, 5)),
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    notificationEnabled: Boolean(row.notification_enabled),
    imageUrl: row.image_url ?? null,
    imageAlt: row.image_alt ?? null,
    imageAttribution: row.image_attribution ?? null
  }
}

export function inputToRow(input: SupplementInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    dose: input.dose,
    dose_unit: input.doseUnit && input.doseUnit.trim().length > 0 ? input.doseUnit.trim() : null,
    quantity: input.quantity,
    quantity_unit: input.quantityUnit.trim(),
    frequency: input.frequency,
    times: input.times,
    start_date: input.startDate,
    end_date: input.endDate,
    notes: input.notes && input.notes.trim().length > 0 ? input.notes.trim() : null,
    notification_enabled: input.notificationEnabled
  }
}
