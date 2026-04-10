import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Billing · Settings' }

// TODO: fetch subscription from Supabase `subscriptions` table
// and Stripe Customer Portal URL from a Server Action

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    description: 'For individuals getting started',
    features: ['1 workspace', '3 projects', '500 MB storage', 'Community support'],
    current: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/mo',
    description: 'For growing studios',
    features: ['Unlimited projects', '20 GB storage', 'Version history', 'Priority support'],
    current: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large studios with advanced needs',
    features: ['SSO / SAML', 'Custom roles', 'SLA', 'Dedicated support'],
    current: false,
  },
]

export default function BillingPage() {
  return (
    <div className="max-w-2xl space-y-8">

      {/* Current plan */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-1">Current plan</h2>
        <p className="text-xs text-sf-muted mb-5">
          Manage your subscription and billing details.
        </p>

        <div className="p-5 rounded-2xl border border-sf-gold/20 bg-sf-gold/5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-sf-text">Pro plan</span>
              <Badge variant="gold">Active</Badge>
            </div>
            <p className="text-xs text-sf-muted">Renews on 1 May 2026 · $49/mo</p>
          </div>
          <Button variant="secondary" size="sm">
            Manage billing →
          </Button>
        </div>
      </section>

      {/* Plan comparison */}
      <section>
        <h2 className="text-sm font-semibold text-sf-text mb-4">Plans</h2>
        <div className="grid grid-cols-3 gap-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`p-4 rounded-2xl border ${
                plan.current
                  ? 'border-sf-gold/30 bg-sf-gold/5'
                  : 'border-sf-border bg-sf-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-sf-text">{plan.name}</span>
                {plan.current && <Badge variant="gold">Current</Badge>}
              </div>
              <div className="flex items-baseline gap-0.5 mb-3">
                <span className="text-xl font-bold text-sf-text">{plan.price}</span>
                {plan.period && (
                  <span className="text-xs text-sf-muted">{plan.period}</span>
                )}
              </div>
              <ul className="space-y-1.5 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs text-sf-muted flex items-center gap-1.5">
                    <span className="text-sf-gold">✓</span> {f}
                  </li>
                ))}
              </ul>
              {!plan.current && (
                <Button
                  variant={plan.name === 'Pro' ? 'primary' : 'secondary'}
                  size="sm"
                  className="w-full"
                >
                  {plan.name === 'Enterprise' ? 'Contact us' : 'Upgrade'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
