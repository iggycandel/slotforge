// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/portal
// Creates a Stripe Customer Portal session and returns the URL.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }               from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { stripe }             from '@/lib/billing/stripe'
import { getOrgSubscription } from '@/lib/billing/subscription'
import { assertWorkspaceAccessBySlug } from '@/lib/supabase/authz'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
  }

  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // App routes by userId — orgId is always null. Use effectiveId throughout.
  const effectiveId = orgId ?? userId

  const sub = await getOrgSubscription(effectiveId)
  if (!sub.stripeCustomerId) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  const body    = await req.json().catch(() => ({}))
  const orgSlug = (body.orgSlug as string | undefined)?.trim() ?? ''
  if (!orgSlug || !(await assertWorkspaceAccessBySlug(userId, orgSlug))) {
    return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL
    ?? req.headers.get('origin')
    ?? 'http://localhost:3000'

  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.stripeCustomerId,
    return_url: `${origin}/${orgSlug}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
