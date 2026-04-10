'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import type { Project, ActionResult } from '@/types'

// ─── Read ───────────────────────────────────────────────────────────────────

/** Fetch all projects for a workspace, optionally filtered. */
export async function getProjects(
  orgSlug: string,
  opts: { status?: string; query?: string } = {}
): Promise<Project[]> {
  const { userId } = await auth()
  if (!userId) return []

  const supabase = await createClient()

  let q = supabase
    .from('projects')
    .select('*, workspaces!inner(slug)')
    .eq('workspaces.slug', orgSlug)
    .order('updated_at', { ascending: false })

  if (opts.status && opts.status !== 'all') {
    q = q.eq('status', opts.status as import('@/types/database').ProjectStatus)
  }
  if (opts.query) {
    q = q.ilike('name', `%${opts.query}%`)
  }

  const { data, error } = await q
  if (error) { console.error('[getProjects]', error); return [] }

  // Map thumbnail_path → thumbnail_url (Supabase Storage public URL)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return (data ?? []).map((row) => ({
    ...row,
    thumbnail_url: row.thumbnail_path
      ? `${supabaseUrl}/storage/v1/object/public/thumbnails/${row.thumbnail_path}`
      : null,
  })) as Project[]
}

/** Fetch the N most-recently-updated projects (for dashboard). */
export async function getRecentProjects(
  orgSlug: string,
  opts: { limit?: number } = {}
): Promise<Project[]> {
  return getProjects(orgSlug, {})
    .then((projects) => projects.slice(0, opts.limit ?? 6))
}

// ─── Write ──────────────────────────────────────────────────────────────────

/** Create a new project in the given workspace. */
export async function createProject(input: {
  orgSlug: string
  name:    string
  theme:   string
  reelset: string
}): Promise<ActionResult<Project>> {
  const { userId } = await auth()
  if (!userId) {
    return { data: null, error: 'Not authenticated' }
  }

  const supabase = await createClient()

  // Resolve workspace ID from slug
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('slug', input.orgSlug)
    .single()

  if (wsError || !workspace) {
    return { data: null, error: 'Workspace not found' }
  }

  const slug = slugify(input.name)

  const { data, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspace.id,
      name:         input.name,
      slug,
      theme:        input.theme,
      reelset:      input.reelset,
      status:       'draft',
      created_by:   userId,
    })
    .select()
    .single()

  if (error) {
    console.error('[createProject]', error)
    return { data: null, error: error.message }
  }

  return {
    data: { ...data, thumbnail_url: null } as Project,
    error: null,
  }
}

/** Update a project's status. */
export async function updateProjectStatus(
  projectId: string,
  status: Project['status']
): Promise<ActionResult<null>> {
  const { userId } = await auth()
  if (!userId) return { data: null, error: 'Not authenticated' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .update({ status })
    .eq('id', projectId)

  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}
