import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

/**
 * Browser Supabase client — used in Client Components.
 *
 * The Clerk JWT is forwarded automatically via the `Authorization` header
 * when you configure Clerk as a custom JWT provider in Supabase:
 *   Dashboard → Authentication → JWT Templates → New (Supabase template)
 *
 * This means Supabase RLS policies can reference `auth.jwt() ->> 'org_id'`
 * to isolate workspace data without any custom auth middleware.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
