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

/** Fetch the active subscription for a Clerk org ID. Falls back to free. */
export async function getOrgSubscription(orgId: string): Promise<OrgSubscription> {
  if (!orgId) return FREE_SUB

  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('subscriptions')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle()

    if (error || !data) return FREE_SUB

    return {
      plan:                  (data.plan as Plan) ?? 'free',
      status:                data.status ?? 'active',
      seatCount:             data.seat_count ?? 1,
      stripeCustomerId:      data.stripe_customer_id,
      stripeSubscriptionId:  data.stripe_subscription_id,
      currentPeriodEnd:      data.current_period_end,
      cancelAtPeriodEnd:     data.cancel_at_period_end ?? false,
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

/** Fetch how many credits this org has used this month vs their allowance. */
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
      .select('credits_used')
      .eq('org_id', orgId)
      .eq('month', month)
      .maybeSingle()

    const used      = data?.credits_used ?? 0
    const remaining = Math.max(included - used, 0)
    return { included, used, remaining, canGenerate: remaining > 0 }
  } catch {
    // On error, allow generation — don't block on infra issues
    return { included, used: 0, remaining: included, canGenerate: true }
  }
}

/** Increment credit usage by `count` for the current month. */
export async function consumeCredits(orgId: string, count = 1): Promise<void> {
  try {
    const supabase = createAdminClient()
    const month    = currentMonth()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    // Upsert: insert row or increment existing credits_used
    const { data: existing } = await sb
      .from('credit_usage')
      .select('credits_used')
      .eq('org_id', orgId)
      .eq('month', month)
      .maybeSingle()

    if (existing) {
      await sb.from('credit_usage')
        .update({ credits_used: existing.credits_used + count, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('month', month)
    } else {
      await sb.from('credit_usage')
        .insert({ org_id: orgId, month, credits_used: count, updated_at: new Date().toISOString() })
    }
  } catch (err) {
    console.error('[credits] Failed to consume credits:', err)
  }
}
