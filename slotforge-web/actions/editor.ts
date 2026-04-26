'use server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectAccess } from '@/lib/supabase/authz'

// v122 / H1 follow-up — server actions must use the service-role admin
// client. The pre-v122 lockdown stripped anon/authenticated of all
// privileges on public tables, so the previous `createClient` (anon-key
// SSR client with Clerk JWT pass-through) returned zero rows and every
// project page 404'd. Auth is enforced HERE via assertProjectAccess
// before any read/write that takes a user-supplied projectId — the
// previous code relied on RLS, which now has nothing to fall back on
// since service-role bypasses it.

export async function getProjectWithPayload(projectId: string) {
  const { userId } = await auth()
  if (!userId) return { data: null, error: 'Not authenticated' }
  if (!(await assertProjectAccess(userId, projectId))) {
    return { data: null, error: 'Not found' }
  }
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()
  return { data, error }
}

export async function autosaveProject(projectId: string, payload: Record<string, unknown>) {
  const { userId } = await auth()
  if (!userId) return { error: 'Not authenticated' }
  if (!(await assertProjectAccess(userId, projectId))) {
    return { error: 'Not found' }
  }
  const supabase  = createAdminClient()
  const thumbnail = (payload._thumbnail as string | undefined) ?? null
  const cleanPayload: Record<string, unknown> = { ...payload }
  delete cleanPayload._thumbnail

  // Strip base64 data URLs from assets — they can be several MB each and blow the payload limit.
  // Exception: custom_N layers have no CDN path, so their base64 is the only copy — keep it.
  if (cleanPayload.assets && typeof cleanPayload.assets === 'object') {
    const safeAssets: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(cleanPayload.assets as Record<string, unknown>)) {
      if (typeof v === 'string' && v.startsWith('data:') && !k.startsWith('custom_')) continue
      safeAssets[k] = v
    }
    cleanPayload.assets = safeAssets
  }

  // Strip base64 data URLs from library items (same reason — each item may have a src or url field).
  if (Array.isArray(cleanPayload.library)) {
    cleanPayload.library = (cleanPayload.library as Record<string, unknown>[]).map(item => {
      if (!item || typeof item !== 'object') return item
      const clean: Record<string, unknown> = { ...item }
      for (const field of ['src', 'url', 'data', 'thumbnail']) {
        if (typeof clean[field] === 'string' && (clean[field] as string).startsWith('data:')) {
          delete clean[field]
        }
      }
      return clean
    })
  }

  // Build update: always save payload; also sync name from gameName if set
  const update: Record<string, unknown> = { payload: cleanPayload, updated_at: new Date().toISOString() }
  const gameName = (payload.gameName as string | undefined)?.trim()
  if (gameName) update.name = gameName
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('projects').update(update).eq('id', projectId)
  // Save thumbnail separately (best-effort) — column is thumbnail_path, not thumbnail_url
  if (thumbnail && !error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('projects').update({ thumbnail_path: thumbnail }).eq('id', projectId)
  }
  return { error }
}

export async function createSnapshot(projectId: string, payload: Record<string, unknown>, label?: string) {
  const { userId } = await auth()
  if (!userId) return { data: null, error: 'Not authenticated' }
  if (!(await assertProjectAccess(userId, projectId))) {
    return { data: null, error: 'Not found' }
  }
  const supabase = createAdminClient()
  // Count existing snapshots to derive an auto-incrementing version number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from('project_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
  const version = (count ?? 0) + 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_snapshots')
    .insert({
      project_id: projectId,
      payload,
      label: label ?? null,
      created_at: new Date().toISOString(),
      version,
      created_by: userId,
    })
    .select()
    .single()
  return { data, error }
}

export async function getSnapshots(projectId: string, limit = 20) {
  const { userId } = await auth()
  if (!userId) return { data: null, error: 'Not authenticated' }
  if (!(await assertProjectAccess(userId, projectId))) {
    return { data: null, error: 'Not found' }
  }
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_snapshots')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

/** Restore a snapshot by id. Resolves the snapshot → its project_id, then
 *  asserts the caller owns that project before applying the payload. The
 *  caller never supplies the project id directly so the same auth chain
 *  applies whether the link is shared internally or guessed. */
export async function restoreSnapshot(snapshotId: string) {
  const { userId } = await auth()
  if (!userId) return { error: 'Not authenticated' }
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshot, error: snapError } = await (supabase as any)
    .from('project_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single()
  if (snapError || !snapshot) return { error: snapError ?? 'Not found' }

  if (!(await assertProjectAccess(userId, snapshot.project_id))) {
    return { error: 'Not found' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('projects')
    .update({ payload: snapshot.payload as Record<string, unknown>, updated_at: new Date().toISOString() })
    .eq('id', snapshot.project_id)
  return { error }
}

/** Delete a single snapshot. Same auth chain as restoreSnapshot — resolve
 *  the snapshot first, then verify ownership before deleting. */
export async function deleteSnapshot(snapshotId: string) {
  const { userId } = await auth()
  if (!userId) return { error: 'Not authenticated' }
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshot } = await (supabase as any)
    .from('project_snapshots')
    .select('project_id')
    .eq('id', snapshotId)
    .maybeSingle()
  if (!snapshot?.project_id) return { error: 'Not found' }

  if (!(await assertProjectAccess(userId, snapshot.project_id))) {
    return { error: 'Not found' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('project_snapshots')
    .delete()
    .eq('id', snapshotId)
  return { error }
}
