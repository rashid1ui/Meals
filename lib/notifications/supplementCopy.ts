// Pure supplement-reminder notification copy - no Supabase, no
// 'use client'/'use server'. Mirrors lib/notifications/copy.ts's split
// (deterministic template, never AI-generated). Unlike meal reminder copy,
// always identifies the actual supplement by name plus its real dose/
// quantity (spec section 10 explicitly forbids a generic "Take your
// vitamin" message when the name/dose is available).

import type { SupplementReminderOccurrence } from './supplementSchedule'

export interface NotificationCopy {
  title: string
  body: string
}

function doseText(occurrence: Pick<SupplementReminderOccurrence, 'dose' | 'doseUnit' | 'quantity' | 'quantityUnit'>): string {
  const parts: string[] = []
  if (occurrence.dose !== null && occurrence.doseUnit) parts.push(`${occurrence.dose} ${occurrence.doseUnit}`)
  if (occurrence.quantity && occurrence.quantityUnit) {
    const unit = occurrence.quantity === 1 ? occurrence.quantityUnit : `${occurrence.quantityUnit}s`
    parts.push(`${occurrence.quantity} ${unit}`)
  }
  return parts.join(' · ')
}

export function buildSupplementReminderCopy(occurrence: SupplementReminderOccurrence): NotificationCopy {
  const dose = doseText(occurrence)
  return {
    title: `💊 ${occurrence.name} reminder`,
    body: dose ? `Time to take your ${occurrence.name}: ${dose}` : `Time to take your ${occurrence.name}.`
  }
}
