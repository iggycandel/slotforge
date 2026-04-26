// ─────────────────────────────────────────────────────────────────────────────
// Spinative — PUT /api/marketing/kits/:templateId
// Marketing Workspace v1 / Day 4
//
// Save the user's customisation for a template (called when they hit
// Save in the Customise modal — Day 6). The vars blob is REPLACED, not
// merged; the modal sends complete state.
//
// Request body: { project_id: string, vars: Record<string, unknown> }
// Response:     { kit: MarketingKitRow }
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                       from '@clerk/nextjs/server'
import { NextRequest, NextResponse }  from 'next/server'
import { z }                          from 'zod'

import { getOrgPlan, canUseAI }       from '@/lib/billing/subscription'
import { assertProjectAccess }        from '@/lib/supabase/authz'
import { getTemplate }                from '@/lib/marketing/registry'
import { updateKitVars }              from '@/lib/marketing/kits'

const RequestSchema = z.object({
  project_id: z.string().uuid(),
  vars:       z.record(z.unknown()),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: { templateId: string } },
) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const effectiveId = orgId ?? userId

  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Marketing kit requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  // templateId comes off the URL — validate it against the registry
  // before touching the DB so a typo can't seed orphaned kit rows.
  const templateId = params.templateId
  if (!getTemplate(templateId)) {
    return NextResponse.json({ error: 'Unknown template_id' }, { status: 404 })
  }

  const body   = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { project_id, vars } = parsed.data

  if (!(await assertProjectAccess(userId, project_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const kit = await updateKitVars(project_id, templateId, vars)
    return NextResponse.json({ kit })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'save failed'
    console.error(`[marketing/kits PUT] ${templateId}:`, message)
    return NextResponse.json({ error: 'save_failed', message }, { status: 500 })
  }
}
