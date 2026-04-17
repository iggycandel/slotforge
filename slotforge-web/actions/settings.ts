'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

export interface UpdateWorkspaceResult {
  ok:     boolean
  error?: string
  /** New slug after update — used to redirect if slug changed */
  newSlug?: string
}

/** Update the Clerk organisation name and/or slug. */
export async function updateWorkspace(
  formData: FormData
): Promise<UpdateWorkspaceResult> {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return { ok: false, error: 'Not authenticated' }

  const name = (formData.get('name') as string | null)?.trim()
  const slug = (formData.get('slug') as string | null)?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')

  if (!name) return { ok: false, error: 'Name is required' }
  if (!slug)  return { ok: false, error: 'Slug is required' }

  try {
    const client = await clerkClient()
    await client.organizations.updateOrganization(orgId, { name, slug })
    // Revalidate the settings page under the potentially new slug
    revalidatePath(`/${slug}/settings/general`)
    return { ok: true, newSlug: slug }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    return { ok: false, error: msg }
  }
}
