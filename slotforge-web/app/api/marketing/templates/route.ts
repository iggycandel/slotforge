// ─────────────────────────────────────────────────────────────────────────────
// Spinative — GET /api/marketing/templates
// Marketing Workspace v1 / Day 1
//
// Returns the catalogue of available templates as a compact summary list:
//   { templates: TemplateSummary[] }
//
// The full template (with layers) is fetched per-id by the render path —
// see /api/marketing/render (Day 4). Keeping the catalogue summary-only
// stops the response ballooning once layer stacks get rich.
//
// Plan gate matches the rest of the marketing surface — Freelancer or
// Studio. Free-tier callers get a 403 so the iframe can show the upgrade
// modal (Day 10).
//
// No assertProjectAccess here: the catalogue is project-agnostic. The
// project gate kicks in on /api/marketing/kits and /api/marketing/render.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse }              from 'next/server'
import { auth }                      from '@clerk/nextjs/server'
import { getOrgPlan, canUseAI }      from '@/lib/billing/subscription'
import { listTemplateSummaries }     from '@/lib/marketing/registry'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // App routes by userId (no Clerk orgs). Use effectiveId so the gate
  // always runs — same pattern as every other AI/feature route.
  const effectiveId = orgId ?? userId
  const plan = await getOrgPlan(effectiveId)
  if (!canUseAI(plan)) {
    // We reuse the same plan flag as AI generation for v1 — the marketing
    // workspace is gated to the same tiers (Freelancer + Studio). Day 10
    // will swap this for a dedicated canUseMarketing(plan) once
    // lib/billing/plans.ts grows the field.
    return NextResponse.json(
      { error: 'upgrade_required', plan,
        message: 'Marketing kit requires a Freelancer or Studio plan.' },
      { status: 403 },
    )
  }

  // Day 1: registry is empty. listTemplateSummaries() returns []; the
  // route still 200s so Day 5's UI scaffolding can be developed against
  // the real shape.
  return NextResponse.json({ templates: listTemplateSummaries() })
}
