// ─────────────────────────────────────────────────────────────────────────────
// Spinative — DELETE /api/marketing/renders
// Marketing Workspace — clear cached renders for one (project, template).
//
// Used by the per-tile ✕ button on the marketing grid: the user wants to
// wipe the cached creative so the next Render produces a fresh asset.
// Removes both the marketing_renders rows AND the underlying Storage
// objects so no stale bytes linger in the bucket.
//
// Why DELETE-on-collection (not /renders/:id): UX is "clear this tile",
// not "clear this specific render". A tile can have multiple renders
// (one per size); the user wants them gone in one action, not N clicks.
//
// Request:  DELETE /api/marketing/renders?project_id=<uuid>&template_id=<id>
// Response: 200 { deleted: number }  — count of rows removed
//
// Authz: assertProjectAccess on the project_id, then we filter rows by
//   kit.project_id so a malicious caller can't delete renders from
//   another tenant by id-stuffing.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                      from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient }         from '@/lib/supabase/admin'
import { assertProjectAccess }       from '@/lib/supabase/authz'
import { getOrgPlan, canUseMarketing } from '@/lib/billing/subscription'
import { getTemplate }               from '@/lib/marketing/registry'

export const maxDuration = 30

export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const effectiveId = orgId ?? userId

  const plan = await getOrgPlan(effectiveId)
  if (!canUseMarketing(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Marketing kit requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  const projectId  = req.nextUrl.searchParams.get('project_id')
  const templateId = req.nextUrl.searchParams.get('template_id')
  if (!projectId)  return NextResponse.json({ error: 'Missing project_id' },  { status: 400 })
  if (!templateId) return NextResponse.json({ error: 'Missing template_id' }, { status: 400 })

  // Reject malformed templateId early — the registry lookup is the
  // canonical "is this a real template" gate. Rejecting here means we
  // never spend a DB round-trip on a typo'd id.
  if (!getTemplate(templateId)) {
    return NextResponse.json({ error: 'Unknown template_id' }, { status: 404 })
  }

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // 1. Find every render whose owning kit belongs to (project, template).
  //    The inner-join shape on kit lets us filter by both the project_id
  //    and template_id in a single query — no kit_id round-trip needed.
  const { data: rows, error: selErr } = await sb
    .from('marketing_renders')
    .select('id, storage_path, kit:marketing_kits!inner(project_id, template_id)')
    .eq('kit.project_id',  projectId)
    .eq('kit.template_id', templateId)

  if (selErr) {
    console.error('[marketing/renders DELETE] select failed:', selErr.message)
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  const list = (rows ?? []) as Array<{
    id: string; storage_path: string;
    kit: { project_id: string; template_id: string }
  }>
  if (list.length === 0) {
    // Idempotent: nothing to delete returns 200 with deleted:0 so the
    // client doesn't surface a confusing error toast on a cleared tile.
    return NextResponse.json({ deleted: 0 })
  }

  // 2. Best-effort Storage cleanup. We don't fail the whole request if
  //    a few objects can't be removed — orphan bytes are the lesser
  //    evil compared to a half-deleted state where DB rows are gone
  //    but the user can't tell.
  const storagePaths = list.map(r => r.storage_path).filter(Boolean)
  if (storagePaths.length > 0) {
    const { error: rmErr } = await sb.storage
      .from('marketing-renders')
      .remove(storagePaths)
    if (rmErr) {
      console.warn('[marketing/renders DELETE] storage.remove warning:', rmErr.message)
    }
  }

  // 3. Now drop the DB rows. The kit row stays — its `vars` blob is
  //    still useful for the next render attempt and represents the
  //    user's saved customisation choices.
  const ids = list.map(r => r.id)
  const { error: delErr, count } = await sb
    .from('marketing_renders')
    .delete({ count: 'exact' })
    .in('id', ids)

  if (delErr) {
    console.error('[marketing/renders DELETE] delete failed:', delErr.message)
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: count ?? ids.length })
}
