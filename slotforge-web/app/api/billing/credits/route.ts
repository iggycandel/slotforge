// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/credits
// Returns the current org's credit status for the current month.
// Used by the header credits indicator.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }                  from '@clerk/nextjs/server'
import { NextResponse }          from 'next/server'
import { getOrgCreditStatus }    from '@/lib/billing/subscription'

export async function GET() {
  const { orgId } = await auth()
  if (!orgId) {
    return NextResponse.json({ error: 'No active organisation' }, { status: 401 })
  }

  const credits = await getOrgCreditStatus(orgId)
  return NextResponse.json(credits)
}
