'use server'

import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertWorkspaceAccessBySlug, assertProjectAccess } from '@/lib/supabase/authz'
import { slugify } from '@/lib/utils'
import { getOrgPlan, underProjectLimit } from '@/lib/billing/subscription'
import type { Project, ActionResult } from '@/types'

// v122 / H1 follow-up — this file ran on the anon-key SSR client pre-v122
// and silently relied on RLS to filter rows. With the public-schema
// lockdown, anon/authenticated have no privileges → every query returned
// empty → list pages went blank, project create silently failed. All
// reads/writes now go through the service-role admin client; ownership
// is checked explicitly via assertWorkspaceAccessBySlug /
// assertProjectAccess before any query that takes a user-supplied id or
// slug.

// ─── Read ───────────────────────────────────────────────────────────────────

/** Fetch all projects for a workspace, optionally filtered. */
export async function getProjects(
  orgSlug: string,
  opts: { status?: string; query?: string } = {}
): Promise<Project[]> {
  const { userId } = await auth()
  if (!userId) return []
  // Verify the caller owns this workspace BEFORE we issue the query.
  // Without this, a malicious caller passing someone else's slug would
  // get back projects through the service-role client.
  if (!(await assertWorkspaceAccessBySlug(userId, orgSlug))) return []

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
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

  // Map thumbnail_path → thumbnail_url. The editor stores JPEG data URLs
  // directly in thumbnail_path (small enough for a 240×135 preview); legacy
  // rows may contain a Supabase Storage path, so handle both.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    thumbnail_url: row.thumbnail_path
      ? ((row.thumbnail_path as string).startsWith('data:')
          ? row.thumbnail_path
          : `${supabaseUrl}/storage/v1/object/public/thumbnails/${row.thumbnail_path}`)
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

  const access = await assertWorkspaceAccessBySlug(userId, input.orgSlug)
  if (!access) {
    return { data: null, error: 'Workspace not found' }
  }

  const supabase = createAdminClient()

  // ── Plan limit check ────────────────────────────────────────────────────────
  const plan = await getOrgPlan(userId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: projectCount } = await (supabase as any)
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', access.workspaceId)

  if (!underProjectLimit(plan, projectCount ?? 0)) {
    return { data: null, error: 'project_limit_reached' }
  }
  // ───────────────────────────────────────────────────────────────────────────

  const slug = slugify(input.name)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('projects')
    .insert({
      workspace_id: access.workspaceId,
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
  if (!(await assertProjectAccess(userId, projectId))) {
    return { data: null, error: 'Not found' }
  }

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('projects')
    .update({ status })
    .eq('id', projectId)

  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}
