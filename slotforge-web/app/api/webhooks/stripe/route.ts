// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/stripe
// Handles Stripe webhook events to keep the `subscriptions` table + the
// authoritative `workspaces.plan` column in sync.
//
// Events handled:
//   checkout.session.completed         → create subscription row, backfill
//                                        Stripe-side metadata so future
//                                        events for this sub always carry
//                                        orgId (works for Pricing-Table
//                                        flow which can't set
//                                        subscription_data.metadata at
//                                        creation time).
//   customer.subscription.updated      → update plan / status / seat_count
//   customer.subscription.deleted      → mark canceled, flip workspace → free
//
// v122 / H4: orgId resolution chain.
//   The pre-v122 webhook bailed out the moment `sub.metadata.orgId` was
//   missing. That meant subs created via Stripe's Pricing Table widget
//   (which only carries `client_reference_id`, not subscription metadata)
//   never had their plan changes / cancellations propagate. Plus the
//   "is the user still paying?" decision at runtime would silently lag
//   reality.
//
//   New chain, tried in order:
//     1. sub.metadata.orgId         — set by either checkout path now
//                                     (custom checkout sets via
//                                     subscription_data.metadata; Pricing
//                                     Table flow gets it backfilled in
//                                     checkout.session.completed below)
//     2. Stripe customer.metadata   — set by /api/billing/checkout when
//                                     the Stripe customer is first
//                                     created (or backfilled by us)
//     3. local subscriptions row    — last resort: look up by
//                                     stripe_sub_id, get workspace_id
//                                     directly. Robust against any
//                                     missing-metadata edge case.
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

// ─── Subscription → workspace_id, via the local subscriptions table ─────────
// Last-resort fallback when neither sub.metadata nor customer.metadata
// carry an orgId. The local row was written by checkout.session.completed
// at sub creation time; if THAT was missing too the user's checkout never
// actually completed and we have no business updating their plan now.
async function resolveWorkspaceIdFromLocalSub(
  stripeSubId: string,
): Promise<string | null> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('subscriptions')
    .select('workspace_id')
    .eq('stripe_sub_id', stripeSubId)
    .maybeSingle()
  return data?.workspace_id ?? null
}

// ─── orgId fallback chain — used by sub.updated / sub.deleted ───────────────
// Order matters: cheapest checks first, Stripe API calls last.
async function resolveOrgIdForSub(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sub: any,
): Promise<{ workspaceId: string | null; clerkOrgId: string | null }> {
  // 1. Subscription-level metadata (set by subscription_data.metadata at
  //    checkout, or by our backfill in checkout.session.completed)
  const fromSub = sub.metadata?.orgId as string | undefined
  if (fromSub) {
    const wid = await resolveWorkspaceId(fromSub)
    if (wid) return { workspaceId: wid, clerkOrgId: fromSub }
  }

  // 2. Customer-level metadata (set when the Stripe customer was created
  //    by /api/billing/checkout, or backfilled below)
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      // Stripe.Customer | DeletedCustomer — .metadata exists on both shapes
      // but TS narrows it away. Cast to any since we only read.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fromCustomer = (customer as any).metadata?.orgId as string | undefined
      if (fromCustomer) {
        const wid = await resolveWorkspaceId(fromCustomer)
        if (wid) return { workspaceId: wid, clerkOrgId: fromCustomer }
      }
    } catch (err) {
      console.error('[webhook] customer lookup failed:', customerId, err)
    }
  }

  // 3. Local subscriptions table — last resort
  const wid = await resolveWorkspaceIdFromLocalSub(sub.id as string)
  return { workspaceId: wid, clerkOrgId: null }
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

  // Mirror plan + stripe_customer_id into workspaces — this is the row the
  // plan gate reads (lib/billing/subscription.ts getOrgSubscription).
  // Without the plan mirror, paid subscribers would stay "free" in the app
  // even after Stripe confirmed their subscription. Mirroring the customer
  // id lets /api/billing/checkout reuse the existing customer on a repeat
  // upgrade attempt instead of creating a new Stripe customer every time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: wsErr } = await (supabase as any)
    .from('workspaces')
    .update({ plan, stripe_customer_id: params.stripeCustomerId })
    .eq('id', params.workspaceId)

  if (wsErr) {
    console.error('[webhook] workspaces mirror failed:', wsErr)
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
        const plan      = planFromPriceId(priceId) ?? 'free'

        // v122 / H4 — backfill orgId onto the Stripe-side records. Custom
        // checkout already sets subscription_data.metadata, but the Stripe
        // Pricing Table widget can't pass that at creation time. Without
        // this, future customer.subscription.updated events for Pricing-
        // Table subs arrive with empty metadata and the handler bails out.
        // We update both the subscription AND the customer so the
        // resolveOrgIdForSub fallback chain has redundant sources.
        await Promise.all([
          stripe.subscriptions.update(sub.id, {
            metadata: { orgId: clerkOrgId, plan },
          }).catch(err => console.error('[webhook] sub metadata backfill failed:', err)),
          stripe.customers.update(session.customer as string, {
            metadata: { orgId: clerkOrgId },
          }).catch(err => console.error('[webhook] customer metadata backfill failed:', err)),
        ])

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
        const sub = event.data.object as any

        // v122 / H4 — fallback chain: sub.metadata → customer.metadata →
        // local subscriptions table. Pre-v122 the handler bailed out the
        // moment sub.metadata.orgId was missing, silently dropping plan
        // changes / cancellations for any sub that didn't have metadata
        // at creation time (everything from the Pricing Table widget).
        const { workspaceId } = await resolveOrgIdForSub(sub)
        if (!workspaceId) {
          console.error('[webhook] sub.updated: could not resolve workspace for sub', sub.id)
          break
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item      = sub.items.data[0] as any
        const priceId   = item.price.id as string
        const seatCount = item.quantity ?? 1

        await upsertSubscription({
          workspaceId,
          stripeCustomerId:   typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
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
        const sub = event.data.object as any

        // Same fallback chain. The local-subscriptions-table fallback is
        // particularly important here because a cancellation can land
        // months after the original checkout, when in-memory metadata
        // assumptions are most likely to have drifted.
        const { workspaceId } = await resolveOrgIdForSub(sub)
        if (!workspaceId) {
          console.error('[webhook] sub.deleted: could not resolve workspace for sub', sub.id)
          break
        }

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
