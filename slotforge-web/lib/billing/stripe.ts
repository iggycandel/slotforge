// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Stripe client singleton (server-side only)
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  // Non-fatal warning during build — the key won't be available at build time
  // but must exist at runtime.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2026-03-25.dahlia',
})
