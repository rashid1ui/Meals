import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)

async function testLock() {
  const userId = '00000000-0000-0000-0000-000000000000' // Fake ID for testing syntax, actually we will just write the code.
}
