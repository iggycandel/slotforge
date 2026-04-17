// ─────────────────────────────────────────────────────────────────────────────
// SlotForge — Subscription plan definitions
// Single source of truth for tier names, limits, and feature flags.
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'studio'

export interface PlanLimits {
  /** Max active projects (null = unlimited) */
  maxProjects:       number | null
  /** Max workspace members including owner (null = unlimited) */
  maxMembers:        number | null
  /** AI generation allowed */
  aiEnabled:         boolean
  /** Asset download / export allowed */
  exportsEnabled:    boolean
  /** Stripe price IDs — used when creating checkout sessions */
  stripePriceId?:    string
}

export const PLANS: Record<Plan, PlanLimits & { name: string; price: string; period?: string; description: string; highlight?: boolean }> = {
  free: {
    name:           'Free',
    price:          '$0',
    description:    'Explore the canvas and manage projects — no card required.',
    maxProjects:    2,
    maxMembers:     1,
    aiEnabled:      false,
    exportsEnabled: false,
  },
  pro: {
    name:           'Pro',
    price:          '$49',
    period:         '/mo',
    description:    'Full AI generation suite for solo art directors.',
    highlight:      true,
    maxProjects:    null,
    maxMembers:     1,
    aiEnabled:      true,
    exportsEnabled: true,
    stripePriceId:  process.env.STRIPE_PRO_PRICE_ID,
  },
  studio: {
    name:           'Studio',
    price:          '$99',
    period:         '/mo',
    description:    'AI + team collaboration for growing studios.',
    maxProjects:    null,
    maxMembers:     10,
    aiEnabled:      true,
    exportsEnabled: true,
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
  pro: [
    'Unlimited projects',
    'Full AI generation (all asset types)',
    'Graphic style presets',
    'Asset version history',
    'PNG / JPG export',
    'Solo workspace',
  ],
  studio: [
    'Everything in Pro',
    'Up to 10 workspace members',
    'Team project access',
    'Priority generation queue',
    'Early access to new features',
    'Email support',
  ],
}

/** Returns the Plan enum value from a Stripe price ID. */
export function planFromPriceId(priceId: string): Plan | null {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)    return 'pro'
  if (priceId === process.env.STRIPE_STUDIO_PRICE_ID) return 'studio'
  return null
}
