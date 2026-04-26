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
import { getOrgPlan, canUseMarketing }     from '@/lib/billing/subscription'
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
  if (!canUseMarketing(plan)) {
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

  let rendersByKit: Record<string, Array<{
    size_label: string; format: string; url: string;
    bytes: number; created_at: string; width: number; height: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layer_boxes: any[];
  }>> = {}
  if (kitIds.length > 0) {
    const { data: rendersData, error: rErr } = await sb
      .from('marketing_renders')
      .select('kit_id, size_label, format, storage_path, bytes, created_at, layer_boxes')
      .in('kit_id', kitIds)
      .order('created_at', { ascending: false })
    if (rErr) {
      console.error('[marketing/kits] renders lookup failed:', rErr.message)
      // Non-fatal: ship kits without renders so the grid still loads.
    } else {
      // Dedupe by (kit_id, size_label, format) — every var-change spawns
      // a new marketing_renders row keyed on vars_hash, but the modal
      // only wants to show ONE entry per shipped size. The query is
      // ordered created_at desc, so the first row we see for any
      // (kit, size, format) triple is the most recent. Subsequent
      // rows are older variants we keep on disk for cache reuse but
      // hide from the user.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allRows = (rendersData ?? []) as Array<{
        kit_id: string; size_label: string; format: string;
        storage_path: string; bytes: number; created_at: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layer_boxes: any[];
      }>
      const seenKey = new Set<string>()
      const latestRows = allRows.filter(r => {
        const key = `${r.kit_id}::${r.size_label}::${r.format}`
        if (seenKey.has(key)) return false
        seenKey.add(key)
        return true
      })
      // Sign each surviving storage_path once. Promises run in parallel.
      const signed = await Promise.all(latestRows.map(async r => ({
        ...r,
        url: await signRenderUrl(r.storage_path).catch(() => ''),
      })))
      rendersByKit = signed.reduce((acc, r) => {
        if (!r.url) return acc
        // Look up the size's pixel dims from the bbox set's first
        // entry isn't reliable — use the size label itself if it's
        // formatted WIDTHxHEIGHT (every v1 template ships labels in
        // that shape). Falls back to 0/0 when label is non-standard
        // (e.g. the press PDF's 'A4_300dpi') — drag isn't relevant
        // for PDFs anyway.
        const dims = parseSizeLabel(r.size_label)
        ;(acc[r.kit_id] = acc[r.kit_id] || []).push({
          size_label: r.size_label,
          format:     r.format,
          url:        r.url,
          bytes:      r.bytes,
          created_at: r.created_at,
          width:      dims.w,
          height:     dims.h,
          layer_boxes: Array.isArray(r.layer_boxes) ? r.layer_boxes : [],
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

/** Best-effort parse of a size label (`'1024x1024'`) → `{ w, h }`.
 *  Returns zeros when the label isn't WxH-shaped (e.g. the press
 *  template's 'A4_300dpi'). The modal uses these for drag math; PDF
 *  templates aren't draggable so the zeros never matter. */
function parseSizeLabel(label: string): { w: number; h: number } {
  const m = /^(\d+)x(\d+)$/i.exec(label.trim())
  if (!m) return { w: 0, h: 0 }
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) }
}
