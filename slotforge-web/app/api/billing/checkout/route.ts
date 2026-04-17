// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/checkout
// Creates a Stripe Checkout session and returns the URL to redirect to.
// ─────────────────────────────────────────────────────────────────────────────

import { auth, clerkClient }  from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { stripe }             from '@/lib/billing/stripe'
import { PLANS }              from '@/lib/billing/plans'
import { getOrgSubscription } from '@/lib/billing/subscription'
import type { Plan }          from '@/lib/billing/plans'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
  }

  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body   = await req.json().catch(() => ({}))
  const plan   = body.plan as Plan | undefined
  if (!plan || !['pro', 'studio'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const priceId = PLANS[plan].stripePriceId
  if (!priceId) {
    return NextResponse.json({ error: 'Stripe price not configured' }, { status: 500 })
  }

  // Fetch user email from Clerk for pre-filling checkout
  const client = await clerkClient()
  const user   = await client.users.getUser(userId)
  const email  = user.emailAddresses[0]?.emailAddress

  // Reuse existing Stripe customer if we already have one
  const existing = await getOrgSubscription(orgId)
  let customerId = existing.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { orgId, userId },
    })
    customerId = customer.id
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Extract orgSlug from referrer for redirect URL
  const referer = req.headers.get('referer') ?? ''
  const slugMatch = referer.match(/\/([^/]+)\/settings/)
  const orgSlug   = slugMatch?.[1] ?? ''

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/${orgSlug}/settings/billing?upgraded=1`,
    cancel_url:  `${origin}/${orgSlug}/settings/billing?canceled=1`,
    subscription_data: {
      metadata: { orgId, plan },
    },
    metadata: { orgId, plan },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
