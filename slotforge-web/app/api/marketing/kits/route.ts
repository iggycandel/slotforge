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

  return NextResponse.json({
    readiness: assetsRes.readiness,
    kits:      kitsRes.data ?? [],
  })
}
