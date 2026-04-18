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
  // Fallback to hardcoded values so the table renders even if env vars are missing
  const tableId  = process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID  ?? 'prctbl_1TNITLRxNNF46RtxUm5XOJGy'
  const pubKey   = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   ?? 'pk_live_51TNE5BRxNNF46RtxTOJczIGT1Di0vCWRHKDqerBFO6Pu3uFBRSm6yPppf1re5lkM4QEUaIG4eRvwUMVO7HMaBCwp00sLVBXkXB'

  if (!tableId || !pubKey) return null

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
