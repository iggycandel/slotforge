import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import type { Database } from '@/types/database'

/**
 * Server Supabase client — used in Server Components and Server Actions.
 *
 * Injects the Clerk session JWT as the Authorization header so that
 * Supabase RLS policies receive the correct `org_id` claim.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const { getToken } = await auth()

  // Get the Supabase-specific JWT from Clerk (requires Clerk JWT Template named "supabase")
  const clerkToken = await getToken({ template: 'supabase' })

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()          { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookieStore.set(name, value, options as any)
          })
        },
      },
      global: {
        headers: clerkToken
          ? { Authorization: `Bearer ${clerkToken}` }
          : {},
      },
    }
  )
}
