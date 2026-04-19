// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/checkout
// Creates a Stripe Checkout session and returns the URL to redirect to.
// ─────────────────────────────────────────────────────────────────────────────

import { auth, clerkClient }  from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { stripe }             from '@/lib/billing/stripe'
import { PLANS }              from '@/lib/billing/plans'
import { getOrgSubscription } from '@/lib/billing/subscription'
import { assertWorkspaceAccessBySlug } from '@/lib/supabase/authz'
import type { Plan }          from '@/lib/billing/plans'

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

  const body    = await req.json().catch(() => ({}))
  const plan    = body.plan as Plan | undefined
  const orgSlug = (body.orgSlug as string | undefined)?.trim() ?? ''
  if (!plan || !['freelancer', 'studio'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }
  if (!orgSlug || !(await assertWorkspaceAccessBySlug(userId, orgSlug))) {
    return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
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
  const existing = await getOrgSubscription(effectiveId)
  let customerId = existing.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { orgId: effectiveId, userId },
    })
    customerId = customer.id
  }

  // Prefer the configured app URL so a spoofed Origin header can't influence
  // the Stripe redirect targets. Fall back to the request origin only in dev.
  const origin = process.env.NEXT_PUBLIC_APP_URL
    ?? req.headers.get('origin')
    ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/${orgSlug}/settings/billing?upgraded=1`,
    cancel_url:  `${origin}/${orgSlug}/settings/billing?canceled=1`,
    subscription_data: {
      metadata: { orgId: effectiveId, plan },
    },
    metadata: { orgId: effectiveId, plan },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
