'use server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '../lib/supabase/server'

export async function getProjectWithPayload(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()
  return { data, error }
}

export async function autosaveProject(projectId: string, payload: Record<string, unknown>) {
  const supabase = await createClient()
  const thumbnail = (payload._thumbnail as string | undefined) ?? null
  const cleanPayload: Record<string, unknown> = { ...payload }
  delete cleanPayload._thumbnail
  // Build update: always save payload; also sync name from gameName if set
  const update: Record<string, unknown> = { payload: cleanPayload, updated_at: new Date().toISOString() }
  const gameName = (payload.gameName as string | undefined)?.trim()
  if (gameName) update.name = gameName
  const { error } = await supabase.from('projects').update(update as any).eq('id', projectId)
  // Save thumbnail separately (best-effort) — column is thumbnail_path, not thumbnail_url
  if (thumbnail && !error) {
    await supabase.from('projects').update({ thumbnail_path: thumbnail }).eq('id', projectId)
  }
  return { error }
}

export async function createSnapshot(projectId: string, payload: Record<string, unknown>, label?: string) {
  const { userId } = await auth()
  if (!userId) return { data: null, error: 'Not authenticated' }
  const supabase = await createClient()
  // Count existing snapshots to derive an auto-incrementing version number
  const { count } = await supabase
    .from('project_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
  const version = (count ?? 0) + 1
  const { data, error } = await supabase
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
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_snapshots')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

export async function restoreSnapshot(snapshotId: string) {
  const supabase = await createClient()
  const { data: snapshot, error: snapError } = await supabase
    .from('project_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single()
  if (snapError || !snapshot) return { error: snapError }
  const { error } = await supabase
    .from('projects')
    .update({ payload: snapshot.payload as Record<string, unknown>, updated_at: new Date().toISOString() })
    .eq('id', snapshot.project_id)
  return { error }
}
