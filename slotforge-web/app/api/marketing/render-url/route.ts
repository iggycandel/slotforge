// ─────────────────────────────────────────────────────────────────────────────
// Spinative — GET /api/marketing/render-url?id=<render_id>
// Marketing Workspace v1 / Day 4
//
// Re-signs the storage path for a marketing_renders row. The bucket is
// private and we never persist the signed URL (it's only valid for an
// hour) — anything that needs to display or download a render asks
// this endpoint each time. Cheap: one DB lookup + one Storage signing
// call (no network, no compose).
//
// Authz: must own the project this render belongs to. The chain is
// render → kit → project → workspace → clerk_org_id, all resolved
// server-side via assertProjectAccess.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                     from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient }        from '@/lib/supabase/admin'
import { assertProjectAccess }      from '@/lib/supabase/authz'
import { signRenderUrl }            from '@/lib/marketing/storage'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Reject malformed ids before hitting the DB — render ids are uuids.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  // Resolve render → kit → project so we can run assertProjectAccess.
  // Single round-trip via inner-join; Supabase's foreign-table syntax
  // returns the parent kit row inline.
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('marketing_renders')
    .select('storage_path, kit:marketing_kits!inner(project_id)')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const projectId = data.kit?.project_id as string | undefined
  if (!projectId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!(await assertProjectAccess(userId, projectId))) {
    // Same response shape as missing — don't leak existence.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const url = await signRenderUrl(data.storage_path as string)
    return NextResponse.json({ url })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sign failed'
    console.error('[marketing/render-url] sign failed:', message)
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 })
  }
}
