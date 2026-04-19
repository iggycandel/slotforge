// ─────────────────────────────────────────────────────────────────────────────
// Project-level authorization helpers.
//
// Every API route and Server Action that accepts a user-supplied `project_id`
// (or an asset id that resolves to one) MUST call assertProjectAccess before
// touching the project's data. Most of our routes use the service-role
// admin client which bypasses RLS, so a plain auth() check is not enough —
// without this, any signed-in user can act on any project by UUID.
//
// Ownership model (current, solo-only):
//   - Every workspace row has `clerk_org_id`.
//   - For a solo user, ensurePersonalWorkspace sets clerk_org_id = userId.
//   - A user has access to a project iff that project's workspace has
//     clerk_org_id === userId.
//
// When team orgs are supported, callers should pass `effectiveId` (orgId ??
// userId) instead of the raw userId and this helper will continue to work.
// The `workspace_members` table exists in the schema but is intentionally
// not maintained (see app/api/webhooks/clerk/route.ts) — don't query it.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from './admin'

export interface ProjectAccess {
  workspaceId: string
}

/**
 * Verify that `ownerId` (= Clerk userId, or effectiveId once orgs exist) owns
 * the workspace that contains `projectId`. Returns the workspace id on
 * success, or null if the project doesn't exist or belongs to someone else.
 */
export async function assertProjectAccess(
  ownerId: string,
  projectId: string,
): Promise<ProjectAccess | null> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('workspace_id, workspaces!inner(clerk_org_id)')
    .eq('id', projectId)
    .maybeSingle()

  if (!project?.workspace_id) return null

  const clerkOrgId = project.workspaces?.clerk_org_id
  if (clerkOrgId !== ownerId) return null

  return { workspaceId: project.workspace_id as string }
}

/**
 * Verify that `ownerId` owns the workspace identified by `slug`.
 * Returns the workspace id on success, or null if the slug doesn't exist
 * or belongs to someone else. Use this anywhere you interpolate an org
 * slug into a URL or external request (e.g. Stripe return URLs).
 */
export async function assertWorkspaceAccessBySlug(
  ownerId: string,
  slug: string,
): Promise<{ workspaceId: string } | null> {
  // Defensive: slug is interpolated into URLs — reject anything that's not
  // a plain slug-ish token before querying. Clerk user ids (user_xxx) and
  // org ids both pass this.
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return null

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ws } = await (supabase as any)
    .from('workspaces')
    .select('id, clerk_org_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!ws || ws.clerk_org_id !== ownerId) return null
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
  ownerId: string,
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

  const access = await assertProjectAccess(ownerId, asset.project_id)
  if (!access) return null

  return {
    projectId:   asset.project_id as string,
    workspaceId: access.workspaceId,
    assetUrl:    asset.url as string,
  }
}
