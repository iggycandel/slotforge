import { auth, clerkClient }    from '@clerk/nextjs/server'
import { getOrgSubscription,
         getOrgCreditStatus }   from '@/lib/billing/subscription'
import { PLANS, PLAN_FEATURES } from '@/lib/billing/plans'
import type { Plan }            from '@/lib/billing/plans'
import BillingActions           from './BillingActions'
import StripePricingTable       from '@/components/billing/StripePricingTable'

interface Props { params: { orgSlug: string } }

export const metadata = { title: 'Billing · Settings' }
export const dynamic  = 'force-dynamic'

function PlanBadge({ plan }: { plan: Plan }) {
  const colors: Record<Plan, string> = {
    free:       'bg-sf-surface text-sf-muted border-sf-border',
    freelancer: 'bg-sf-gold/10 text-sf-gold border-sf-gold/30',
    studio:     'bg-purple-500/10 text-purple-300 border-purple-500/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${colors[plan]}`}>
      {PLANS[plan].name}
    </span>
  )
}

function CreditBar({ used, included }: { used: number; included: number }) {
  const pct  = included > 0 ? Math.min((used / included) * 100, 100) : 0
  const low  = pct >= 80
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-sf-muted mb-1">
        <span>AI credits this month</span>
        <span className={low ? 'text-red-400 font-medium' : 'text-sf-text'}>
          {used} / {included} used
        </span>
      </div>
      <div className="h-1.5 bg-sf-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${low ? 'bg-red-400' : 'bg-sf-gold'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default async function BillingPage({ params }: Props) {
  const { userId, orgId } = await auth()
  // The app routes by userId (not Clerk org), so orgId is often null.
  // Use userId as the billing identifier when no org exists.
  const effectiveId       = orgId ?? userId ?? ''
  const sub               = effectiveId ? await getOrgSubscription(effectiveId) : null
  const credits           = effectiveId ? await getOrgCreditStatus(effectiveId) : null
  const activePlan        = (sub?.plan ?? 'free') as Plan

  // Fetch user email for pre-filling Stripe checkout
  let userEmail: string | undefined
  if (userId) {
    try {
      const client = await clerkClient()
      const user   = await client.users.getUser(userId)
      userEmail    = user.emailAddresses[0]?.emailAddress
    } catch { /* non-fatal */ }
  }

  const periodEnd = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
    : null

  return (
    <div className="max-w-2xl space-y-8">

      {/* ── Current plan ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-1">Current plan</h2>
        <p className="text-xs text-sf-muted mb-5">
          Manage your subscription and billing details.
        </p>

        <div className={`p-5 rounded-2xl border ${
          activePlan === 'free'
            ? 'border-sf-border bg-sf-surface'
            : 'border-sf-gold/20 bg-sf-gold/5'
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-sf-text">{PLANS[activePlan].name} plan</span>
                <PlanBadge plan={activePlan} />
                {sub?.cancelAtPeriodEnd && (
                  <span className="text-xs text-red-400 border border-red-400/30 bg-red-400/10 px-2 py-0.5 rounded-md">
                    Cancels {periodEnd}
                  </span>
                )}
              </div>
              {activePlan === 'free' ? (
                <p className="text-xs text-sf-muted">Free plan — no card required.</p>
              ) : (
                <p className="text-xs text-sf-muted">
                  {sub?.cancelAtPeriodEnd ? 'Access until' : 'Renews'} {periodEnd}
                  {sub?.seatCount && sub.seatCount > 1 ? ` · ${sub.seatCount} seats` : ''}
                  {' · '}{PLANS[activePlan].price}{PLANS[activePlan].period}
                </p>
              )}
            </div>
            {activePlan !== 'free' && (
              <BillingActions mode="portal" orgSlug={params.orgSlug} />
            )}
          </div>

          {/* Credit usage bar — only for paying plans */}
          {credits && activePlan !== 'free' && (
            <CreditBar used={credits.used} included={credits.included} />
          )}
          {/* Manage billing button for paid plans */}
          {activePlan !== 'free' && (
            <div className="mt-4 pt-4 border-t border-sf-border">
              <BillingActions mode="portal" orgSlug={params.orgSlug} />
            </div>
          )}
        </div>
      </section>

      {/* ── Upgrade — show Stripe Pricing Table for free users ──────────── */}
      {activePlan === 'free' && effectiveId && (
        <section>
          <h2 className="text-sm font-semibold text-sf-text mb-1">Upgrade your plan</h2>
          <p className="text-xs text-sf-muted mb-5">
            All prices are per seat, per month. VAT added at checkout where applicable.
          </p>
          <StripePricingTable orgId={effectiveId} email={userEmail} />
        </section>
      )}

      {/* ── Plan feature comparison (always visible) ────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-4">Plan features</h2>
        <div className="grid grid-cols-3 gap-3">
          {(['free', 'freelancer', 'studio'] as Plan[]).map((plan) => {
            const info     = PLANS[plan]
            const features = PLAN_FEATURES[plan]
            const isCurrent = plan === activePlan

            return (
              <div
                key={plan}
                className={`p-4 rounded-2xl border flex flex-col ${
                  isCurrent
                    ? 'border-sf-gold/30 bg-sf-gold/5'
                    : info.highlight
                    ? 'border-sf-border bg-sf-surface ring-1 ring-sf-gold/20'
                    : 'border-sf-border bg-sf-surface'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-sf-text">{info.name}</span>
                  {isCurrent && <PlanBadge plan={plan} />}
                  {info.highlight && !isCurrent && (
                    <span className="text-[10px] font-semibold text-sf-gold bg-sf-gold/10 border border-sf-gold/20 px-1.5 py-0.5 rounded">
                      Popular
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-0.5 mb-1">
                  <span className="text-xl font-bold text-sf-text">{info.price}</span>
                  {info.period && <span className="text-xs text-sf-muted">{info.period}</span>}
                </div>
                <p className="text-[11px] text-sf-subtle mb-3 leading-relaxed">{info.description}</p>

                <ul className="space-y-1.5 flex-1">
                  {features.map((f) => (
                    <li key={f} className={`text-xs flex items-start gap-1.5 ${f.startsWith('—') ? 'text-sf-subtle' : 'text-sf-muted'}`}>
                      <span className={`${f.startsWith('—') ? 'text-sf-subtle' : 'text-sf-gold'} mt-0.5 shrink-0`}>
                        {f.startsWith('—') ? '—' : '✓'}
                      </span>
                      <span>{f.startsWith('—') ? f.slice(2) : f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 pt-3 border-t border-sf-border">
                  {isCurrent ? (
                    <p className="text-center text-xs text-sf-subtle">Current plan</p>
                  ) : plan !== 'free' ? (
                    <BillingActions mode="checkout" orgSlug={params.orgSlug} plan={plan} />
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-sf-text mb-4">Frequently asked</h2>
        {[
          ['Can I cancel anytime?',
           'Yes — cancel from the billing portal and you keep access until the end of your billing period. No questions asked.'],
          ['What happens to my projects if I downgrade?',
           'Your projects and assets are preserved. AI generation and exports are paused until you re-subscribe.'],
          ['What is a credit?',
           'One credit = one AI-generated image. Freelancer seats include 50 credits/month; Studio seats include 100 credits/month. Unused credits reset monthly.'],
          ['Can I buy more credits?',
           'Yes — top-up packs (50 credits for €10) are available from the billing portal. They expire at the end of the current billing month.'],
          ['Do you offer annual billing?',
           'Annual plans with 2 months free are available — contact us after subscribing and we\'ll switch you over.'],
        ].map(([q, a]) => (
          <div key={q} className="p-4 rounded-xl border border-sf-border bg-sf-surface">
            <p className="text-xs font-semibold text-sf-text mb-1">{q}</p>
            <p className="text-xs text-sf-muted">{a}</p>
          </div>
        ))}
      </section>

    </div>
  )
}
