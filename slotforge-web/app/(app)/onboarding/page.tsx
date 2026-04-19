import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Post-auth landing page. Resolves the user's actual workspace slug from the
 * database (which may differ from userId if the user has renamed their slug)
 * and redirects into that workspace. Falls back to creating a personal
 * workspace on first sign-in.
 */
export default async function OnboardingPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const supabase = createAdminClient()

  // Look up the workspace by clerk_org_id (stable) — not by slug, because
  // the user may have renamed their slug since their last visit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('workspaces')
    .select('slug')
    .eq('clerk_org_id', userId)
    .maybeSingle()

  if (existing?.slug) {
    redirect(`/${existing.slug}/dashboard`)
  }

  // First-time user — create a personal workspace with slug = userId.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created } = await (supabase as any)
    .from('workspaces')
    .insert({
      clerk_org_id: userId,
      name:         'Personal',
      slug:         userId,
      plan:         'free',
    })
    .select('slug')
    .single()

  redirect(`/${created?.slug ?? userId}/dashboard`)
}
