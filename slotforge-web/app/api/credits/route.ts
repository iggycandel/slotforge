// ─────────────────────────────────────────────────────────────────────────────
// Spinative — GET /api/credits
// Returns the current user's credit status for the Generate page.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse }     from 'next/server'
import { auth }             from '@clerk/nextjs/server'
import { getOrgPlan }       from '@/lib/billing/subscription'
import { getOrgCreditStatus } from '@/lib/billing/subscription'
import { PLANS }            from '@/lib/billing/plans'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const effectiveId = orgId ?? userId
  const plan        = await getOrgPlan(effectiveId)
  const credits     = await getOrgCreditStatus(effectiveId)
  const planInfo    = PLANS[plan]

  return NextResponse.json({
    plan,
    aiEnabled:      planInfo.aiEnabled,
    exportsEnabled: planInfo.exportsEnabled,
    ...credits,
  })
}
