'use server'

import { auth }         from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('workspaces')
      .update({ name, slug })
      .eq('slug', currentSlug)
      // Ensure the user owns this workspace (clerk_org_id stores userId for personal workspaces)
      .eq('clerk_org_id', userId)

    if (error) return { ok: false, error: error.message }

    revalidatePath(`/${slug}/settings/general`)
    return { ok: true, newSlug: slug }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Update failed' }
  }
}
