import { createClient } from '@/lib/supabase/server'

export async function getUser() {
  return { id: 'test-user-id', email: 'test@example.com' }
}
