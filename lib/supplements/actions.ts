'use server'

// DB-touching wrapper around lib/supplements/validation.ts's pure
// validation - mirrors the split already used for notifications
// (lib/notifications/actions.ts wraps lib/notifications/schedule.ts) and
// diet plans (app/dashboard/actions.ts wraps lib/diet). Every mutation here
// re-validates server-side (never trusts the client form alone, per spec
// section 5) and every read/write is scoped to the authenticated caller's
// own user_id, via the per-request RLS client - never an id read straight
// off the client request.

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { validateSupplementInput, type SupplementInput, type SupplementFrequency } from './validation'

type Result<T> = { data: T } | { error: string }

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
}

interface SupplementRow {
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
}

// Postgres `time` values round-trip as "HH:MM:SS" - trimmed to "HH:MM" here,
// exactly like lib/notifications/actions.ts already does for
// meals.reminder_time, so every layer above this one only ever sees the
// wall-clock format isValidReminderTime/isMealReminderDue expect.
function rowToDTO(row: SupplementRow): SupplementDTO {
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
    notificationEnabled: Boolean(row.notification_enabled)
  }
}

function inputToRow(input: SupplementInput): Record<string, unknown> {
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

const SELECT_COLUMNS = 'id, name, dose, dose_unit, quantity, quantity_unit, frequency, times, start_date, end_date, notes, notification_enabled'

export async function getSupplements(): Promise<Result<SupplementDTO[]>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_supplements')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at')

  if (error) {
    console.error('[supplements] getSupplements failed:', error)
    return { error: 'Failed to load your supplements.' }
  }

  return { data: ((data as SupplementRow[] | null) || []).map(rowToDTO) }
}

export async function createSupplement(input: SupplementInput): Promise<Result<SupplementDTO>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const validation = validateSupplementInput(input)
  if (!validation.valid) return { error: validation.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_supplements')
    .insert({ ...inputToRow(input), user_id: user.id })
    .select(SELECT_COLUMNS)
    .single()

  if (error || !data) {
    console.error('[supplements] createSupplement failed:', error)
    return { error: 'Failed to save this supplement.' }
  }

  return { data: rowToDTO(data as SupplementRow) }
}

// Bulk variant for onboarding (spec section 6 allows adding several
// supplements before the wizard ever calls a server action) - one insert
// round-trip for the whole batch rather than N sequential createSupplement
// calls, per spec section 17's "avoid unnecessary database requests".
// Validates every item before inserting any of them, so a single bad entry
// can never leave a partial batch saved.
export async function createSupplementsBulk(inputs: SupplementInput[]): Promise<Result<SupplementDTO[]>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (inputs.length === 0) return { data: [] }

  for (const input of inputs) {
    const validation = validateSupplementInput(input)
    if (!validation.valid) return { error: validation.error }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_supplements')
    .insert(inputs.map(input => ({ ...inputToRow(input), user_id: user.id })))
    .select(SELECT_COLUMNS)

  if (error || !data) {
    console.error('[supplements] createSupplementsBulk failed:', error)
    return { error: 'Failed to save your supplements.' }
  }

  return { data: (data as SupplementRow[]).map(rowToDTO) }
}

// Ownership-checked (eq user_id) via the normal per-request RLS client - an
// id from a stale/foreign session can never update another user's row; a
// mismatched id simply matches zero rows and PostgREST's `.single()` then
// reports "no rows", surfaced below as a generic not-found error rather than
// a raw database error (spec section 5's "do not expose database errors
// directly to users").
export async function updateSupplement(id: string, input: SupplementInput): Promise<Result<SupplementDTO>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const validation = validateSupplementInput(input)
  if (!validation.valid) return { error: validation.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_supplements')
    .update(inputToRow(input))
    .eq('id', id)
    .eq('user_id', user.id)
    .select(SELECT_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[supplements] updateSupplement failed:', error)
    return { error: 'Failed to update this supplement.' }
  }
  if (!data) return { error: 'Supplement not found.' }

  return { data: rowToDTO(data as SupplementRow) }
}

export async function deleteSupplement(id: string): Promise<Result<void>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('user_supplements').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    console.error('[supplements] deleteSupplement failed:', error)
    return { error: 'Failed to delete this supplement.' }
  }
  return { data: undefined }
}

// Turning notifications off must never delete the supplement (spec section
// 8) - this only ever touches notification_enabled, via the same
// ownership-checked update as every other mutation here.
export async function toggleSupplementNotification(id: string, enabled: boolean): Promise<Result<void>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_supplements')
    .update({ notification_enabled: enabled })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[supplements] toggleSupplementNotification failed:', error)
    return { error: 'Failed to update notification setting.' }
  }
  return { data: undefined }
}
