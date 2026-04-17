// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Subscription plan definitions
// Per-seat model: Freelancer €29/seat/mo · Studio €49/seat/mo
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'freelancer' | 'studio'

export interface PlanLimits {
  /** Max active projects (null = unlimited) */
  maxProjects:       number | null
  /** Max workspace members including owner (null = unlimited) */
  maxMembers:        number | null
  /** AI generation allowed */
  aiEnabled:         boolean
  /** Asset download / export allowed */
  exportsEnabled:    boolean
  /** Included AI credits per seat per month */
  creditsPerSeat:    number
  /** Stripe price IDs — used when creating checkout sessions */
  stripePriceId?:    string
}

export const PLANS: Record<Plan, PlanLimits & {
  name:         string
  price:        string
  period?:      string
  description:  string
  highlight?:   boolean
}> = {
  free: {
    name:           'Free',
    price:          '€0',
    description:    'Explore the canvas and manage projects — no card required.',
    maxProjects:    2,
    maxMembers:     1,
    aiEnabled:      false,
    exportsEnabled: false,
    creditsPerSeat: 0,
  },
  freelancer: {
    name:           'Freelancer',
    price:          '€29',
    period:         '/seat/mo',
    description:    'Full AI generation for solo art directors and indie designers.',
    highlight:      false,
    maxProjects:    null,
    maxMembers:     1,
    aiEnabled:      true,
    exportsEnabled: true,
    creditsPerSeat: 50,
    stripePriceId:  process.env.STRIPE_FREELANCER_PRICE_ID,
  },
  studio: {
    name:           'Studio',
    price:          '€49',
    period:         '/seat/mo',
    description:    'AI generation + team collaboration for growing studios.',
    highlight:      true,
    maxProjects:    null,
    maxMembers:     null,   // unlimited seats, pay per seat
    aiEnabled:      true,
    exportsEnabled: true,
    creditsPerSeat: 100,
    stripePriceId:  process.env.STRIPE_STUDIO_PRICE_ID,
  },
}

export const PLAN_FEATURES: Record<Plan, string[]> = {
  free: [
    'Up to 2 projects',
    'Canvas editor (full access)',
    'Manual asset uploads',
    'Solo workspace only',
    '— AI generation not available',
    '— Exports not available',
  ],
  freelancer: [
    'Unlimited projects',
    '50 AI credits / seat / month',
    'Full AI generation (all asset types)',
    'Graphic style presets',
    'GDD parsing & auto-setup',
    'PNG export at full resolution',
    'Solo workspace (1 seat)',
    'Email support',
  ],
  studio: [
    'Everything in Freelancer',
    '100 AI credits / seat / month',
    'Multi-seat team workspace',
    'Shared style library & templates',
    'Batch generation with progress tracking',
    'Version history & rollback',
    'Priority generation queue',
    'Email + live chat support',
  ],
}

/** Returns the Plan enum value from a Stripe price ID. */
export function planFromPriceId(priceId: string): Plan | null {
  if (priceId === process.env.STRIPE_FREELANCER_PRICE_ID) return 'freelancer'
  if (priceId === process.env.STRIPE_STUDIO_PRICE_ID)     return 'studio'
  return null
}
