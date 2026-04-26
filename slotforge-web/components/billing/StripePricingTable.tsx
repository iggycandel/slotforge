'use client'

// ─────────────────────────────────────────────────────────────────────────────
// StripePricingTable
// Renders the Stripe-hosted pricing table as a web component.
// client-reference-id is set to the Clerk orgId so the webhook can identify
// which workspace just subscribed.
// ─────────────────────────────────────────────────────────────────────────────

import Script from 'next/script'

interface Props {
  orgId:   string
  email?:  string
}

declare global {
  // Stripe pricing table is a custom web element; silence TS unknown element
  namespace JSX {
    interface IntrinsicElements {
      'stripe-pricing-table': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'pricing-table-id':  string
        'publishable-key':   string
        'client-reference-id'?: string
        'customer-email'?:   string
      }, HTMLElement>
    }
  }
}

export default function StripePricingTable({ orgId, email }: Props) {
  // v122 / M2 — env-var audit. The pre-v122 version of this file pinned a
  // production Stripe publishable key + pricing table id as fallback
  // values. The keys themselves are by-design public (Stripe ships them
  // to every browser via their JS SDK), so leakage is not the concern;
  // the concerns are (a) test/dev environments accidentally rendering the
  // live pricing table when env vars aren't wired, (b) painful key
  // rotation because the fallback is stale source. Fail loudly on
  // missing env: the null-guard below renders nothing rather than
  // silently routing to prod Stripe.
  const tableId = process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID
  const pubKey  = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

  if (!tableId || !pubKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[StripePricingTable] NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID or ' +
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing — pricing table not rendered.'
      )
    }
    return null
  }

  return (
    <>
      <Script
        src="https://js.stripe.com/v3/pricing-table.js"
        strategy="afterInteractive"
      />
      <stripe-pricing-table
        pricing-table-id={tableId}
        publishable-key={pubKey}
        client-reference-id={orgId}
        customer-email={email}
      />
    </>
  )
}
