// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/stripe
// Handles Stripe webhook events to keep the `subscriptions` table in sync.
//
// Events handled:
//   checkout.session.completed         → create/update subscription row
//   customer.subscription.updated      → update plan/status
//   customer.subscription.deleted      → mark as canceled (back to free)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { stripe }                    from '@/lib/billing/stripe'
import { createAdminClient }         from '@/lib/supabase/admin'
import { planFromPriceId }           from '@/lib/billing/plans'

// Stripe webhooks must be consumed as raw body — not parsed JSON
export const runtime = 'nodejs'

async function upsertSubscription(params: {
  orgId:              string
  stripeCustomerId:   string
  stripeSubId:        string
  priceId:            string
  status:             string
  currentPeriodEnd:   number
  cancelAtPeriodEnd:  boolean
}) {
  const plan = planFromPriceId(params.priceId) ?? 'free'
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('subscriptions')
    .upsert({
      org_id:                 params.orgId,
      stripe_customer_id:     params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubId,
      plan,
      status:                 params.status,
      current_period_end:     new Date(params.currentPeriodEnd * 1000).toISOString(),
      cancel_at_period_end:   params.cancelAtPeriodEnd,
      updated_at:             new Date().toISOString(),
    }, { onConflict: 'org_id' })
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const sig  = req.headers.get('stripe-signature')
  const body = await req.text()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? '', secret)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = event.data.object as any
        if (session.mode !== 'subscription') break

        const orgId = session.metadata?.orgId as string | undefined
        if (!orgId) { console.error('[webhook] No orgId in session metadata'); break }

        // Expand the subscription to get price details
        const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
          expand: ['items.data.price'],
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const priceId = (sub.items.data[0].price as any).id as string

        await upsertSubscription({
          orgId,
          stripeCustomerId:   session.customer as string,
          stripeSubId:        sub.id,
          priceId,
          status:             sub.status,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentPeriodEnd:   (sub as any).current_period_end as number,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cancelAtPeriodEnd:  (sub as any).cancel_at_period_end as boolean,
        })
        break
      }

      case 'customer.subscription.updated': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub    = event.data.object as any
        const orgId  = sub.metadata?.orgId as string | undefined
        if (!orgId) break

        const priceId = sub.items.data[0].price.id as string
        await upsertSubscription({
          orgId,
          stripeCustomerId:   sub.customer as string,
          stripeSubId:        sub.id,
          priceId,
          status:             sub.status,
          currentPeriodEnd:   sub.current_period_end as number,
          cancelAtPeriodEnd:  sub.cancel_at_period_end as boolean,
        })
        break
      }

      case 'customer.subscription.deleted': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub   = event.data.object as any
        const orgId = sub.metadata?.orgId as string | undefined
        if (!orgId) break

        const supabase = createAdminClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('subscriptions')
          .update({ plan: 'free', status: 'canceled', updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[webhook] Handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
