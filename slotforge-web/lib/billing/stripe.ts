// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Stripe client singleton (server-side only)
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from 'stripe'

// STRIPE_SECRET_KEY may be absent at build time (Vercel doesn't expose secrets
// during the build phase for edge/static analysis). The actual key is required
// at *request* time — each route handler validates it before use.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2026-03-25.dahlia',
})
