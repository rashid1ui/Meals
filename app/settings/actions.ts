'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { cookies } from 'next/headers'

export async function resetAccount() {
  try {
    const user = await getUser()
    if (!user) {
      return { ok: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Delete all user application data explicitly from the bottom up to ensure safety
    // against foreign key constraints, since ON DELETE CASCADE cannot be guaranteed.
    const { error: foodsError } = await supabase.from('foods').delete().eq('user_id', user.id)
    if (foodsError) throw new Error(`Failed to delete foods: ${foodsError.message}`)

    const { error: mealsError } = await supabase.from('meals').delete().eq('user_id', user.id)
    if (mealsError) throw new Error(`Failed to delete meals: ${mealsError.message}`)

    const { error: plansError } = await supabase.from('diet_plans').delete().eq('user_id', user.id)
    if (plansError) throw new Error(`Failed to delete diet plans: ${plansError.message}`)

    // We do NOT delete the profiles row, as it is tied to the auth identity.
    // We only update the 'updated_at' to release any potential generation locks.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (profileError) throw new Error(`Failed to update profile: ${profileError.message}`)

    // Clear the onboarding cookie so the user is directed back to the start
    const cookieStore = await cookies()
    cookieStore.delete('gym_meals_onboarded')

    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Settings] Account reset failed:', message)
    return { ok: false, error: 'An unexpected error occurred while resetting your account. Please try again.' }
  }
}
