// Client-side form value for a supplement - string-based (every field binds
// directly to an <input>), converted to/from the DB-shaped SupplementInput/
// SupplementDTO at the edges. Shared by every place a supplement is
// added/edited (dashboard, onboarding) so there is exactly one conversion
// path, per the project's "do not duplicate components/logic" convention.

import { getLocalDateString } from '@/lib/tracking/date'
import type { SupplementInput, SupplementFrequency } from '@/lib/supplements/validation'
import type { SupplementDTO } from '@/lib/supplements/actions'

export interface SupplementFormValue {
  name: string
  dose: string
  doseUnit: string
  quantity: string
  quantityUnit: string
  frequency: SupplementFrequency
  times: string[]
  startDate: string
  endDate: string // '' = ongoing (no end date)
  notes: string
  notificationEnabled: boolean
}

export function emptySupplementFormValue(): SupplementFormValue {
  return {
    name: '',
    dose: '',
    doseUnit: '',
    quantity: '1',
    quantityUnit: 'capsule',
    frequency: 'once_daily',
    times: ['08:00'],
    startDate: getLocalDateString(),
    endDate: '',
    notes: '',
    notificationEnabled: true
  }
}

export function supplementDTOToFormValue(dto: SupplementDTO): SupplementFormValue {
  return {
    name: dto.name,
    dose: dto.dose === null ? '' : String(dto.dose),
    doseUnit: dto.doseUnit ?? '',
    quantity: String(dto.quantity),
    quantityUnit: dto.quantityUnit,
    frequency: dto.frequency,
    times: dto.times.length > 0 ? dto.times : ['08:00'],
    startDate: dto.startDate,
    endDate: dto.endDate ?? '',
    notes: dto.notes ?? '',
    notificationEnabled: dto.notificationEnabled
  }
}

export function supplementFormValueToInput(value: SupplementFormValue): SupplementInput {
  return {
    name: value.name.trim(),
    dose: value.dose.trim() === '' ? null : parseFloat(value.dose),
    doseUnit: value.doseUnit.trim() === '' ? null : value.doseUnit.trim(),
    quantity: parseFloat(value.quantity),
    quantityUnit: value.quantityUnit.trim(),
    frequency: value.frequency,
    times: value.times,
    startDate: value.startDate,
    endDate: value.endDate.trim() === '' ? null : value.endDate,
    notes: value.notes.trim() === '' ? null : value.notes.trim(),
    notificationEnabled: value.notificationEnabled
  }
}
