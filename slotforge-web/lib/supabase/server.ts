import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import type { Database } from '@/types/database'

/**
 * @deprecated v122 / H1 — DO NOT USE for the public schema.
 *
 * Post-v122 lockdown, anon and authenticated have zero privileges on
 * every public table. This anon-key SSR client (with optional Clerk JWT
 * pass-through) returns empty result sets and broken writes for any
 * `public.*` query.
 *
 * Use lib/supabase/admin.ts (service-role bypass) for server-side
 * reads/writes, with explicit `assertProjectAccess` /
 * `assertWorkspaceAccessBySlug` calls in lib/supabase/authz.ts as the
 * authorization gate.
 *
 * The file is kept only for the (currently unused) future scenario
 * where client-side direct DB access is reintroduced — in which case
 * narrow per-table RLS policies must be added to grant access back to
 * `authenticated`.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const { getToken } = await auth()

  // Get the Supabase-specific JWT from Clerk (requires Clerk JWT Template named "supabase").
  // If the template isn't configured in Clerk, getToken throws — catch and fall back to
  // the anon key so the app doesn't crash; RLS policies will apply as an anonymous user.
  let clerkToken: string | null = null
  try {
    clerkToken = await getToken({ template: 'supabase' })
  } catch (err) {
    console.warn('[supabase/server] Clerk JWT template "supabase" not found — using anon key.', err)
  }

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
