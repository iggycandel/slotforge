// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Subscription & credit helpers
// All server-side; never import this from client components.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import type { Plan }         from './plans'
import { PLANS }             from './plans'

export interface OrgSubscription {
  plan:                  Plan
  status:                string
  seatCount:             number
  stripeCustomerId?:     string
  stripeSubscriptionId?: string
  currentPeriodEnd?:     string
  cancelAtPeriodEnd:     boolean
}

const FREE_SUB: OrgSubscription = {
  plan:              'free',
  status:            'active',
  seatCount:         1,
  cancelAtPeriodEnd: false,
}

/** Fetch the active subscription for a Clerk principal (user ID in this
 *  app, since Clerk orgs aren't used). Source of truth is `workspaces.plan`
 *  keyed by `clerk_org_id` — the `subscriptions` table schema (workspace_id,
 *  stripe_sub_id) doesn't match what the old lookup queried (`org_id`),
 *  which silently returned FREE_SUB for every user and kept everyone on the
 *  free plan regardless of actual subscription state. Stripe-specific
 *  metadata (customer/subscription IDs, period end) can be layered back in
 *  once the subscriptions schema is harmonised with the webhook writer. */
export async function getOrgSubscription(orgId: string): Promise<OrgSubscription> {
  if (!orgId) return FREE_SUB

  try {
    const supabase = createAdminClient()
    // v122 / H4 — also return stripe_customer_id so /api/billing/checkout
    // can reuse an existing Stripe customer instead of creating a new one
    // every time. Pre-v122 this column was never returned, so the customer-
    // reuse branch (`if (!customerId)`) always evaluated as true and every
    // checkout attempt minted a fresh Stripe customer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('workspaces')
      .select('plan, stripe_customer_id')
      .eq('clerk_org_id', orgId)
      .maybeSingle()

    if (error || !data) return FREE_SUB

    return {
      ...FREE_SUB,
      plan:             (data.plan as Plan) ?? 'free',
      stripeCustomerId: (data.stripe_customer_id as string | null) ?? undefined,
    }
  } catch {
    return FREE_SUB
  }
}

/** Quick helper — just returns the Plan string. */
export async function getOrgPlan(orgId: string): Promise<Plan> {
  const sub = await getOrgSubscription(orgId)
  return sub.plan
}

/** Returns true if the plan has AI generation enabled. */
export function canUseAI(plan: Plan): boolean {
  return PLANS[plan].aiEnabled
}

/** Returns true if the plan unlocks the Marketing workspace. Today
 *  this mirrors canUseAI — marketing is gated to the same tiers.
 *  Kept as a separate helper so a future "Marketing add-on" can be
 *  threaded through without untangling the shared aiEnabled check
 *  from every AI route. */
export function canUseMarketing(plan: Plan): boolean {
  return PLANS[plan].marketingEnabled
}

/** Returns true if the plan allows exports. */
export function canExport(plan: Plan): boolean {
  return PLANS[plan].exportsEnabled
}

/** Returns true if the org is under the project limit. */
export function underProjectLimit(plan: Plan, currentCount: number): boolean {
  const limit = PLANS[plan].maxProjects
  if (limit === null) return true
  return currentCount < limit
}

/** Returns true if the org can add another member. */
export function underMemberLimit(plan: Plan, currentCount: number): boolean {
  const limit = PLANS[plan].maxMembers
  if (limit === null) return true
  return currentCount < limit
}

// ─── Credit helpers ───────────────────────────────────────────────────────────

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export interface CreditStatus {
  included:  number   // credits included this month (seats × creditsPerSeat)
  used:      number   // credits consumed this month
  remaining: number   // included - used (clamped to 0)
  canGenerate: boolean
}

/** Fetch how many credits this org has used this month vs their allowance.
 *
 *  v122 / H1: production column is `used`, not `credits_used`. The whole
 *  history of this function up to v121 silently failed into the catch
 *  block (column doesn't exist → SELECT errors → catch returns
 *  `{ used: 0, remaining: included, canGenerate: true }` to every caller).
 *  Net effect: the credit gate has been theatre — every user got their
 *  full allowance reported as remaining no matter how many they consumed.
 *  This commit restores the actual gate. */
export async function getOrgCreditStatus(orgId: string): Promise<CreditStatus> {
  const sub     = await getOrgSubscription(orgId)
  const plan    = PLANS[sub.plan]
  const included = plan.creditsPerSeat * Math.max(sub.seatCount, 1)

  if (!plan.aiEnabled) {
    return { included: 0, used: 0, remaining: 0, canGenerate: false }
  }

  try {
    const supabase = createAdminClient()
    const month    = currentMonth()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('credit_usage')
      .select('used')
      .eq('org_id', orgId)
      .eq('month', month)
      .maybeSingle()

    const used      = data?.used ?? 0
    const remaining = Math.max(included - used, 0)
    return { included, used, remaining, canGenerate: remaining > 0 }
  } catch {
    // On error, allow generation — don't block on infra issues
    return { included, used: 0, remaining: included, canGenerate: true }
  }
}

// ─── Reserve / refund (v121 / C2) ───────────────────────────────────────────
//
// The pre-v121 consumeCredits() did a SELECT-then-UPDATE with no atomicity
// AND ran AFTER the OpenAI request — two compounding bugs:
//
//   1. Lost-update race. Two parallel calls both read `credits_used = N`,
//      both wrote N+1, counter only advanced by 1 instead of 2.
//   2. Consume-after-call. A user with 1 remaining credit could fire 10
//      parallel requests, all pass the cheap gate, all generate, all
//      "consume" 1 credit but only 1 increment landed (per #1). The other
//      9 OpenAI calls were free.
//
// reserveCredits() closes both:
//   • Calls the consume_credit RPC, which does a single atomic UPSERT
//     guarded by `included` — overflow returns NULL.
//   • Routes call it BEFORE hitting OpenAI. If the API call fails,
//     refundCredits() puts the credit back. Net effect: budget is honest
//     even under concurrency, and a depleted budget can't burn provider
//     cost.
//
// We keep getOrgCreditStatus() unchanged for the read-only display path
// (header, /api/credits) — it doesn't need to be atomic.

// Flat shape rather than a discriminated union — tsconfig has strict:false
// (legacy reasons), and TS doesn't narrow `if (!r.ok)` to the false-variant
// without strictNullChecks. Optional fields keep call-site code compact:
//   if (!r.ok) {
//     if (r.reason === 'insufficient') return 402…
//     if (r.reason === 'plan_disabled') return 403…
//     return 500…
//   }
export interface ReserveResult {
  ok:         boolean
  reason?:    'plan_disabled' | 'insufficient' | 'error'
  used?:      number
  remaining?: number
}

/**
 * Atomically reserve `count` credits for `orgId`. Returns ok:true with the
 * new used/remaining figures on success. Returns ok:false:'insufficient'
 * if the increment would exceed the included quota. Plan lookup happens
 * inside this helper so callers don't have to compute `included` themselves.
 */
export async function reserveCredits(orgId: string, count = 1): Promise<ReserveResult> {
  if (!orgId || count <= 0) return { ok: false, reason: 'error' }

  const sub      = await getOrgSubscription(orgId)
  const plan     = PLANS[sub.plan]
  if (!plan.aiEnabled) return { ok: false, reason: 'plan_disabled' }

  const included = plan.creditsPerSeat * Math.max(sub.seatCount, 1)

  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('consume_credit', {
      p_org_id:   orgId,
      p_count:    count,
      p_included: included,
    })
    if (error) {
      console.error('[credits] reserveCredits RPC error:', error)
      return { ok: false, reason: 'error' }
    }
    // The RPC returns the new credits_used integer on success, or NULL when
    // the increment would have overshot the quota. supabase-js surfaces
    // NULL as `null` here.
    if (data === null || data === undefined) {
      return { ok: false, reason: 'insufficient' }
    }
    const used = Number(data) || 0
    return { ok: true, used, remaining: Math.max(included - used, 0) }
  } catch (err) {
    console.error('[credits] reserveCredits threw:', err)
    return { ok: false, reason: 'error' }
  }
}

/**
 * Refund `count` credits for `orgId` — used by failure paths after a
 * successful reserveCredits but failed downstream call (OpenAI errored,
 * Storage upload failed, etc). Best-effort: a failed refund is logged
 * but doesn't surface as a route error since the user-visible failure
 * is whatever caused the refund in the first place.
 */
export async function refundCredits(orgId: string, count = 1): Promise<void> {
  if (!orgId || count <= 0) return
  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('refund_credit', {
      p_org_id: orgId,
      p_count:  count,
    })
    if (error) console.error('[credits] refundCredits RPC error:', error)
  } catch (err) {
    console.error('[credits] refundCredits threw:', err)
  }
}

/**
 * Legacy alias — kept so any caller that didn't migrate to reserve/refund
 * still works, but it now goes through the atomic RPC. Returns silently
 * on failure to preserve the old fire-and-forget contract.
 *
 * @deprecated Prefer reserveCredits + refundCredits in new code.
 */
export async function consumeCredits(orgId: string, count = 1): Promise<void> {
  const r = await reserveCredits(orgId, count)
  if (!r.ok) {
    console.warn(`[credits] consumeCredits fell through: ${r.reason} (org=${orgId}, count=${count})`)
  }
}
