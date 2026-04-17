// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Subscription helpers
// All server-side; never import this from client components.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import type { Plan }         from './plans'
import { PLANS }             from './plans'

export interface OrgSubscription {
  plan:                  Plan
  status:                string
  stripeCustomerId?:     string
  stripeSubscriptionId?: string
  currentPeriodEnd?:     string
  cancelAtPeriodEnd:     boolean
}

const FREE_SUB: OrgSubscription = {
  plan:              'free',
  status:            'active',
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
