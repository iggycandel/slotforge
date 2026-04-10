import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Service-role Supabase client — bypasses RLS entirely.
 * ONLY used in:
 *  - /api/webhooks/clerk  (syncing org/user data server-side)
 *  - /api/webhooks/stripe (updating subscription rows)
 *
 * Never expose this client or the SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
