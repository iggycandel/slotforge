'use server'

import { auth }              from '@clerk/nextjs/server'
import { revalidatePath }    from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertWorkspaceAccessBySlug } from '@/lib/supabase/authz'

// v122 / H1 follow-up — switched to service-role admin client, ownership
// gated explicitly via assertWorkspaceAccessBySlug. See actions/editor.ts
// for the full rationale.

export interface UpdateWorkspaceResult {
  ok:     boolean
  error?: string
  /** New slug after update — used to redirect if slug changed */
  newSlug?: string
}

/**
 * Update the workspace name and slug in Supabase.
 * The app routes by userId (no Clerk orgs), so we look up the workspace
 * by the current slug and update it directly in the workspaces table.
 */
export async function updateWorkspace(
  formData: FormData
): Promise<UpdateWorkspaceResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: 'Not authenticated' }

  const name        = (formData.get('name') as string | null)?.trim()
  const slug        = (formData.get('slug') as string | null)?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const currentSlug = (formData.get('currentSlug') as string | null)?.trim()

  if (!name)        return { ok: false, error: 'Name is required' }
  if (!slug)        return { ok: false, error: 'Slug is required' }
  if (!currentSlug) return { ok: false, error: 'Current slug missing' }

  // Verify ownership before any write — service-role bypasses RLS so the
  // .eq('clerk_org_id', userId) belt that used to protect this query is
  // no longer load-bearing.
  const access = await assertWorkspaceAccessBySlug(userId, currentSlug)
  if (!access) return { ok: false, error: 'Workspace not found' }

  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('workspaces')
      .update({ name, slug })
      .eq('id', access.workspaceId)

    if (error) return { ok: false, error: error.message }

    revalidatePath(`/${slug}/settings/general`)
    return { ok: true, newSlug: slug }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Update failed' }
  }
}
