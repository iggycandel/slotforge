// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/credits
// Returns the current org's credit status for the current month.
// Used by the header credits indicator.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                  from '@clerk/nextjs/server'
import { NextResponse }          from 'next/server'
import { getOrgCreditStatus }    from '@/lib/billing/subscription'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  // App routes by userId — orgId is always null.
  const effectiveId = orgId ?? userId

  const credits = await getOrgCreditStatus(effectiveId)
  return NextResponse.json(credits)
}
