// ─────────────────────────────────────────────────────────────────────────────
// Project-level authorization helpers.
//
// Every API route and Server Action that accepts a user-supplied `project_id`
// (or an asset id that resolves to one) MUST call assertProjectAccess before
// touching the project's data. Most of our routes use the service-role
// admin client which bypasses RLS, so a plain auth() check is not enough —
// without this, any signed-in user can act on any project by UUID.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from './admin'

export interface ProjectAccess {
  workspaceId: string
}

/**
 * Verify that `userId` is a member of the workspace that owns `projectId`.
 * Returns the project's workspace_id on success, or null if the project
 * doesn't exist or the user isn't a member of its workspace.
 */
export async function assertProjectAccess(
  userId: string,
  projectId: string,
): Promise<ProjectAccess | null> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('workspace_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project?.workspace_id) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabase as any)
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', project.workspace_id)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (!member) return null
  return { workspaceId: project.workspace_id as string }
}

/**
 * Verify that `userId` is a member of the workspace identified by `slug`.
 * Returns the workspace id on success, or null if the slug doesn't exist
 * or the user isn't a member. Use this anywhere you interpolate an
 * org slug into a URL or external request (e.g. Stripe return URLs).
 */
export async function assertWorkspaceAccessBySlug(
  userId: string,
  slug: string,
): Promise<{ workspaceId: string } | null> {
  // Defensive: slug is interpolated into URLs — reject anything that's not
  // a plain slug-ish token before querying.
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return null

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ws } = await (supabase as any)
    .from('workspaces')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!ws?.id) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabase as any)
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', ws.id)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (!member) return null
  return { workspaceId: ws.id as string }
}

/**
 * Same as assertProjectAccess but resolves the project from a
 * `generated_assets.id` first. Used by the DELETE endpoint which
 * identifies the target by asset id rather than project id.
 *
 * Returns { projectId, workspaceId, assetUrl } on success, null on deny.
 */
export async function assertAssetAccess(
  userId: string,
  assetId: string,
): Promise<{ projectId: string; workspaceId: string; assetUrl: string } | null> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: asset } = await (supabase as any)
    .from('generated_assets')
    .select('url, project_id')
    .eq('id', assetId)
    .maybeSingle()

  if (!asset?.project_id) return null

  const access = await assertProjectAccess(userId, asset.project_id)
  if (!access) return null

  return {
    projectId:   asset.project_id as string,
    workspaceId: access.workspaceId,
    assetUrl:    asset.url as string,
  }
}
