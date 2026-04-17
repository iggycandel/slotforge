// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/portal
// Creates a Stripe Customer Portal session and returns the URL.
// ─────────────────────────────────────────────────────────────────────────────

import { auth }               from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { stripe }             from '@/lib/billing/stripe'
import { getOrgSubscription } from '@/lib/billing/subscription'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
  }

  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sub = await getOrgSubscription(orgId)
  if (!sub.stripeCustomerId) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  const origin   = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const referer  = req.headers.get('referer') ?? ''
  const slugMatch = referer.match(/\/([^/]+)\/settings/)
  const orgSlug   = slugMatch?.[1] ?? ''

  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.stripeCustomerId,
    return_url: `${origin}/${orgSlug}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
