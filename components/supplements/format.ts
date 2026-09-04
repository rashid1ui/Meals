// Pure display formatting for supplement cards - no Supabase, no
// 'use client'. Kept separate from lib/supplements/validation.ts (which is
// about correctness, not presentation).

import { FREQUENCY_OPTIONS, type SupplementFrequency } from '@/lib/supplements/validation'

// "08:00" -> "8:00 AM" - same 24h->12h formatting AddMealModal already uses
// for its own time input, reused here so every reminder time in the app
// reads the same way.
export function formatTime12h(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return time
  const hours = parseInt(match[1], 10)
  const minutes = match[2]
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = ((hours + 11) % 12) + 1
  return `${displayHours}:${minutes} ${period}`
}

export function frequencyLabel(frequency: SupplementFrequency): string {
  return FREQUENCY_OPTIONS.find(f => f.value === frequency)?.label ?? frequency
}

export function formatDoseAndQuantity(supplement: {
  dose: number | null
  doseUnit: string | null
  quantity: number
  quantityUnit: string
}): string {
  const parts: string[] = []
  if (supplement.dose !== null && supplement.doseUnit) parts.push(`${supplement.dose} ${supplement.doseUnit}`)
  const unit = supplement.quantity === 1 ? supplement.quantityUnit : `${supplement.quantityUnit}s`
  parts.push(`${supplement.quantity} ${unit}`)
  return parts.join(' • ')
}

export function formatSchedule(frequency: SupplementFrequency, times: string[]): string {
  return `${frequencyLabel(frequency)} • ${times.map(formatTime12h).join(', ')}`
}
