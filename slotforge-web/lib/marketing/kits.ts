// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Marketing Workspace v1 / Day 4
// Kit row helpers. A kit = one (project, template) pair plus the user's
// stored vars. Render endpoints need a kit_id to anchor cache rows
// against, so they call ensureKit() to upsert the row before rendering.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import type { MarketingKitRow } from './types'

/**
 * Get-or-create a kit row for (project, template). Idempotent — calling
 * twice with the same args returns the same row. Returns the full row
 * so callers can read kit.vars without a follow-up query.
 *
 * `vars` is only applied on INSERT. To update an existing kit's vars,
 * use updateKitVars() — that's what PUT /api/marketing/kits/:templateId
 * does. ensureKit is for "I just need a kit_id to render against."
 */
export async function ensureKit(
  projectId:  string,
  templateId: string,
): Promise<MarketingKitRow> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: existing } = await sb
    .from('marketing_kits')
    .select('id, project_id, template_id, vars, updated_at')
    .eq('project_id', projectId)
    .eq('template_id', templateId)
    .maybeSingle()

  if (existing) return existing as MarketingKitRow

  // INSERT-then-SELECT avoids the upsert race where two parallel
  // ensureKit calls could both insert; the unique index will block the
  // second and we re-read.
  const { data: inserted, error } = await sb
    .from('marketing_kits')
    .insert({ project_id: projectId, template_id: templateId, vars: {} })
    .select('id, project_id, template_id, vars, updated_at')
    .single()

  if (error) {
    // Probably 23505 (unique violation) from a concurrent insert.
    // Re-read the winner's row.
    const { data: retry } = await sb
      .from('marketing_kits')
      .select('id, project_id, template_id, vars, updated_at')
      .eq('project_id', projectId)
      .eq('template_id', templateId)
      .maybeSingle()
    if (retry) return retry as MarketingKitRow
    throw new Error(`[marketing/kits] ensureKit failed: ${error.message}`)
  }
  return inserted as MarketingKitRow
}

/**
 * Replace a kit's vars. Used by PUT /api/marketing/kits/:templateId
 * when the user clicks Save in the Customise modal. The vars blob is
 * REPLACED, not merged — the modal sends the complete state.
 */
export async function updateKitVars(
  projectId:  string,
  templateId: string,
  vars:       Record<string, unknown>,
): Promise<MarketingKitRow> {
  await ensureKit(projectId, templateId)   // make sure the row exists
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data, error } = await sb
    .from('marketing_kits')
    .update({ vars, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('template_id', templateId)
    .select('id, project_id, template_id, vars, updated_at')
    .single()

  if (error || !data) {
    throw new Error(`[marketing/kits] updateKitVars failed: ${error?.message ?? 'no row'}`)
  }
  return data as MarketingKitRow
}
