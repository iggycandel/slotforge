import { auth }                from '@clerk/nextjs/server'
import { getOrgSubscription }  from '@/lib/billing/subscription'
import { PLANS, PLAN_FEATURES } from '@/lib/billing/plans'
import type { Plan }            from '@/lib/billing/plans'
import BillingActions           from './BillingActions'

interface Props { params: { orgSlug: string } }

export const metadata = { title: 'Billing · Settings' }
export const dynamic  = 'force-dynamic'

function PlanBadge({ plan }: { plan: Plan }) {
  const colors: Record<Plan, string> = {
    free:   'bg-sf-surface text-sf-muted border-sf-border',
    pro:    'bg-sf-gold/10 text-sf-gold border-sf-gold/30',
    studio: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${colors[plan]}`}>
      {PLANS[plan].name}
    </span>
  )
}

export default async function BillingPage({ params }: Props) {
  const { orgId }  = await auth()
  const sub        = orgId ? await getOrgSubscription(orgId) : null
  const activePlan = (sub?.plan ?? 'free') as Plan

  const periodEnd = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="max-w-2xl space-y-8">

      {/* ── Current plan ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-1">Current plan</h2>
        <p className="text-xs text-sf-muted mb-5">
          Manage your subscription and billing details.
        </p>

        <div className={`p-5 rounded-2xl border flex items-center justify-between gap-4 ${
          activePlan === 'free'
            ? 'border-sf-border bg-sf-surface'
            : 'border-sf-gold/20 bg-sf-gold/5'
        }`}>
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
                {sub?.cancelAtPeriodEnd ? 'Access until' : 'Renews on'} {periodEnd} · {PLANS[activePlan].price}{PLANS[activePlan].period}
              </p>
            )}
          </div>

          {/* Portal button — only shown for paying customers */}
          {activePlan !== 'free' && <BillingActions mode="portal" orgSlug={params.orgSlug} />}
        </div>
      </section>

      {/* ── Plan comparison ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-4">Plans</h2>
        <div className="grid grid-cols-3 gap-3">
          {(['free', 'pro', 'studio'] as Plan[]).map((plan) => {
            const info     = PLANS[plan]
            const features = PLAN_FEATURES[plan]
            const isCurrent = plan === activePlan
            const isUpgrade = (
              (activePlan === 'free' && (plan === 'pro' || plan === 'studio')) ||
              (activePlan === 'pro'  && plan === 'studio')
            )

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

                <ul className="space-y-1.5 mb-4 flex-1">
                  {features.map((f) => (
                    <li key={f} className={`text-xs flex items-start gap-1.5 ${f.startsWith('—') ? 'text-sf-subtle' : 'text-sf-muted'}`}>
                      <span className={f.startsWith('—') ? 'text-sf-subtle mt-0.5' : 'text-sf-gold mt-0.5'}>
                        {f.startsWith('—') ? '—' : '✓'}
                      </span>
                      <span>{f.startsWith('—') ? f.slice(2) : f}</span>
                    </li>
                  ))}
                </ul>

                {isUpgrade && (
                  <BillingActions mode="checkout" plan={plan} orgSlug={params.orgSlug} />
                )}
                {isCurrent && activePlan !== 'free' && (
                  <div className="text-center text-xs text-sf-subtle py-1">Current plan</div>
                )}
                {plan === 'free' && activePlan !== 'free' && (
                  <div className="text-center text-xs text-sf-subtle py-1">Downgrade via billing portal</div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-sf-text mb-4">Frequently asked</h2>
        {[
          ['Can I cancel anytime?', 'Yes — cancel from the billing portal and you keep access until the end of your billing period.'],
          ['What happens to my projects if I downgrade?', 'Your projects and assets are preserved. You just lose access to AI generation and exports until you re-subscribe.'],
          ['Do you offer annual billing?', 'Annual plans with 2 months free are available — contact us after subscribing.'],
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
