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
import { scheduleImageResolution } from '@/lib/images/schedule'
import { validateSupplementInput, type SupplementInput } from './validation'
import { rowToDTO, inputToRow, SUPPLEMENT_SELECT_COLUMNS as SELECT_COLUMNS, type SupplementDTO, type SupplementRow } from './mapRow'

type Result<T> = { data: T } | { error: string }

export type { SupplementDTO }

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

  const dto = rowToDTO(data as SupplementRow)
  // Non-blocking: resolve an exact product image (Open Food Facts) or a
  // representative one after the response is sent. Failure leaves the pill icon.
  scheduleImageResolution({ kind: 'supplement', id: dto.id })
  return { data: dto }
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

  const dtos = (data as SupplementRow[]).map(rowToDTO)
  for (const dto of dtos) scheduleImageResolution({ kind: 'supplement', id: dto.id })
  return { data: dtos }
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
