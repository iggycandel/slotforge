// ─────────────────────────────────────────────────────────────────────────────
// Spinative — GET /api/marketing/kits?project_id=<uuid>
// Marketing Workspace v1 / Day 4
//
// Returns every marketing_kits row for a project plus a flat readiness
// summary the iframe uses to decide:
//   • "show the empty / Getting Ready state" (assets missing), or
//   • "render the template grid".
//
// Response shape:
//   {
//     readiness: {
//       hasBackground: boolean,
//       hasLogo: boolean,
//       hasCharacter: boolean,
//       hasCharacterTransparent: boolean
//     },
//     kits: Array<{
//       id: string,
//       template_id: string,
//       vars: Record<string, unknown>,
//       updated_at: string
//     }>
//   }
//
// Per-kit render thumbnails are NOT inlined here — Day 5's grid fetches
// them lazily via /api/marketing/render-url so this endpoint stays small
// even when a project has 20+ kits.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                     from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient }        from '@/lib/supabase/admin'
import { assertProjectAccess }      from '@/lib/supabase/authz'
import { getOrgPlan, canUseAI }     from '@/lib/billing/subscription'
import { loadMarketingAssets }      from '@/lib/marketing/assets'
import { signRenderUrl }            from '@/lib/marketing/storage'

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })

  // Plan gate
  const effectiveId = orgId ?? userId
  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Marketing kit requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  if (!(await assertProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Two parallel reads — the kit list (just metadata, fast) and the
  // readiness probe (does a generated_assets lookup + 4 small URL HEADs).
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [kitsRes, assetsRes] = await Promise.all([
    sb.from('marketing_kits')
      .select('id, template_id, vars, updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false }),
    loadMarketingAssets(projectId),
  ])

  if (kitsRes.error) {
    return NextResponse.json({ error: kitsRes.error.message }, { status: 500 })
  }

  // Pull all renders for these kits in one query so the iframe doesn't
  // fan out per-kit on first open. We sign URLs on the way out — the
  // bucket is private; signed URLs live for an hour. The grid uses the
  // largest size's URL as a tile thumbnail; the modal shows the full
  // list on open so the user sees their previous renders without
  // re-rendering.
  const kits = (kitsRes.data ?? []) as Array<{
    id: string; template_id: string; vars: Record<string, unknown>; updated_at: string
  }>
  const kitIds = kits.map(k => k.id)

  let rendersByKit: Record<string, Array<{ size_label: string; format: string; url: string; bytes: number; created_at: string }>> = {}
  if (kitIds.length > 0) {
    const { data: rendersData, error: rErr } = await sb
      .from('marketing_renders')
      .select('kit_id, size_label, format, storage_path, bytes, created_at')
      .in('kit_id', kitIds)
      .order('created_at', { ascending: false })
    if (rErr) {
      console.error('[marketing/kits] renders lookup failed:', rErr.message)
      // Non-fatal: ship kits without renders so the grid still loads.
    } else {
      // Sign each unique storage_path once. Renders within the same kit
      // share the bucket so signing is the only per-row cost — the
      // returned promises run in parallel.
      const rows = (rendersData ?? []) as Array<{
        kit_id: string; size_label: string; format: string;
        storage_path: string; bytes: number; created_at: string
      }>
      const signed = await Promise.all(rows.map(async r => ({
        ...r,
        url: await signRenderUrl(r.storage_path).catch(() => ''),
      })))
      rendersByKit = signed.reduce((acc, r) => {
        if (!r.url) return acc
        ;(acc[r.kit_id] = acc[r.kit_id] || []).push({
          size_label: r.size_label,
          format:     r.format,
          url:        r.url,
          bytes:      r.bytes,
          created_at: r.created_at,
        })
        return acc
      }, {} as typeof rendersByKit)
    }
  }

  return NextResponse.json({
    readiness: assetsRes.readiness,
    kits: kits.map(k => ({
      ...k,
      renders: rendersByKit[k.id] ?? [],
    })),
  })
}
