// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/stripe
// Handles Stripe webhook events to keep the `subscriptions` table + the
// authoritative `workspaces.plan` column in sync.
//
// Events handled:
//   checkout.session.completed         → create/update subscription row
//   customer.subscription.updated      → update plan/status/seat_count
//   customer.subscription.deleted      → mark as canceled, flip workspace to free
//
// orgId resolution order (what Stripe calls client_reference_id / metadata):
//   1. session.client_reference_id  (set by Stripe Pricing Table)
//   2. session.metadata.orgId       (set by custom checkout API)
//   3. subscription.metadata.orgId  (fallback for sub events)
//
// The ID Stripe carries is the Clerk principal — either the userId (this
// app) or a Clerk orgId. The subscriptions table itself keys on the Supabase
// workspace_id, so we resolve clerk_org_id → workspace row before every
// write. Plan mirroring into workspaces.plan is what the plan gate actually
// reads (see lib/billing/subscription.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { stripe }                    from '@/lib/billing/stripe'
import { createAdminClient }         from '@/lib/supabase/admin'
import { planFromPriceId }           from '@/lib/billing/plans'

// Stripe webhooks must be consumed as raw body — not parsed JSON
export const runtime = 'nodejs'

// ─── Clerk principal → workspace row resolution ──────────────────────────────
async function resolveWorkspaceId(clerkOrgId: string): Promise<string | null> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('workspaces')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .maybeSingle()
  if (error) {
    console.error('[webhook] workspace lookup failed for', clerkOrgId, error)
    return null
  }
  return data?.id ?? null
}

// ─── Upsert one subscription row + mirror plan onto the workspace ────────────
async function upsertSubscription(params: {
  workspaceId:        string
  stripeCustomerId:   string
  stripeSubId:        string
  priceId:            string
  status:             string
  currentPeriodEnd:   number
  cancelAtPeriodEnd:  boolean
  seatCount?:         number
}) {
  const plan     = planFromPriceId(params.priceId) ?? 'free'
  const supabase = createAdminClient()

  // Upsert on stripe_sub_id — Stripe's identity for a subscription. The
  // subscriptions.stripe_sub_id column already has a UNIQUE constraint, so
  // this is a safe conflict target across checkout.completed → sub.updated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertErr } = await (supabase as any)
    .from('subscriptions')
    .upsert({
      workspace_id:         params.workspaceId,
      stripe_customer_id:   params.stripeCustomerId,
      stripe_sub_id:        params.stripeSubId,
      plan,
      seat_count:           params.seatCount ?? 1,
      status:               params.status,
      current_period_end:   new Date(params.currentPeriodEnd * 1000).toISOString(),
      cancel_at_period_end: params.cancelAtPeriodEnd,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'stripe_sub_id' })

  if (upsertErr) {
    console.error('[webhook] subscriptions upsert failed:', upsertErr)
    throw upsertErr
  }

  // Mirror the plan into workspaces.plan — this is the column the plan gate
  // reads (lib/billing/subscription.ts getOrgSubscription). Without this
  // mirror, paid subscribers would stay "free" in the app even after Stripe
  // confirmed their subscription.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: wsErr } = await (supabase as any)
    .from('workspaces')
    .update({ plan })
    .eq('id', params.workspaceId)

  if (wsErr) {
    console.error('[webhook] workspaces.plan mirror failed:', wsErr)
    throw wsErr
  }
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

        // Stripe Pricing Table sets client_reference_id; custom checkout sets metadata.orgId
        const clerkOrgId = (session.client_reference_id as string | null)
                        ?? (session.metadata?.orgId as string | undefined)
        if (!clerkOrgId) { console.error('[webhook] No clerkOrgId in session'); break }

        const workspaceId = await resolveWorkspaceId(clerkOrgId)
        // 200-log-and-skip so Stripe doesn't retry forever for a user that
        // doesn't have a workspace row. Real onboarding creates one before
        // checkout, so this path is almost always a stale webhook.
        if (!workspaceId) { console.error('[webhook] No workspace for', clerkOrgId); break }

        // Expand the subscription to get price + quantity (seat count)
        const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
          expand: ['items.data.price'],
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item      = sub.items.data[0] as any
        const priceId   = item.price.id as string
        const seatCount = item.quantity ?? 1

        await upsertSubscription({
          workspaceId,
          stripeCustomerId:   session.customer as string,
          stripeSubId:        sub.id,
          priceId,
          seatCount,
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
        const sub        = event.data.object as any
        const clerkOrgId = sub.metadata?.orgId as string | undefined
        if (!clerkOrgId) break

        const workspaceId = await resolveWorkspaceId(clerkOrgId)
        if (!workspaceId) { console.error('[webhook] No workspace for', clerkOrgId); break }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item      = sub.items.data[0] as any
        const priceId   = item.price.id as string
        const seatCount = item.quantity ?? 1

        await upsertSubscription({
          workspaceId,
          stripeCustomerId:   sub.customer as string,
          stripeSubId:        sub.id,
          priceId,
          seatCount,
          status:             sub.status,
          currentPeriodEnd:   sub.current_period_end as number,
          cancelAtPeriodEnd:  sub.cancel_at_period_end as boolean,
        })
        break
      }

      case 'customer.subscription.deleted': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub        = event.data.object as any
        const clerkOrgId = sub.metadata?.orgId as string | undefined
        if (!clerkOrgId) break

        const workspaceId = await resolveWorkspaceId(clerkOrgId)
        if (!workspaceId) { console.error('[webhook] No workspace for', clerkOrgId); break }

        const supabase = createAdminClient()
        // Mark the subscription row as canceled (keep for audit) and flip
        // the workspace back to the free tier so the plan gate locks down.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('subscriptions')
          .update({
            status:     'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_sub_id', sub.id as string)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('workspaces')
          .update({ plan: 'free' })
          .eq('id', workspaceId)
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
