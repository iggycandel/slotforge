// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Feature registry (v1)
//
// Concrete definitions for the 5 v1 features. Each entry is the single source
// of truth for: settings schema (Zod), default settings, and asset slots
// (with conditional logic). See docs/features-v1-catalogue.md.
//
// Phase 1 deliverable: this file compiles, schemas validate, defaults parse
// cleanly. No editor integration yet — that's Phase 2.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import type { FeatureDef, FeatureId } from '@/types/features'

// ─── 1. Free Spins ───────────────────────────────────────────────────────────

const FreeSpinsSchema = z.object({
  triggerSymbol:     z.enum(['scatter', 'bonus', 'wild']).default('scatter'),
  triggerCount:      z.number().int().min(3).max(5).default(3),
  awardSpins:        z.number().int().min(5).max(50).default(10),
  retriggerEnabled:  z.boolean().default(true),
  retriggerCount:    z.number().int().min(2).max(5).default(3),
  retriggerSpins:    z.number().int().min(1).max(25).default(5),
  multiplierMode:    z.enum(['none', 'flat', 'progressive']).default('none'),
  multiplierValue:   z.number().int().min(2).max(10).default(2),
  progressiveStart:  z.number().int().min(1).default(1),
  progressiveStep:   z.number().int().min(1).default(1),
  progressiveCap:    z.number().int().min(2).default(10),
  endCondition:      z.enum(['spins_only', 'target_win', 'manual']).default('spins_only'),
})
type FreeSpinsSettings = z.infer<typeof FreeSpinsSchema>

const freeSpins: FeatureDef<FreeSpinsSettings> = {
  id:          'freespin',
  label:       'Free Spins',
  group:       'bonus',
  description: 'Scatter-triggered free spins with optional multipliers and retriggers.',
  settingsSchema:  FreeSpinsSchema,
  defaultSettings: FreeSpinsSchema.parse({}),
  assetSlots: [
    { key: 'freespins.intro_banner',          label: 'Intro banner',           requirement: 'required',
      description: '"Free Spins!" pre-round screen' },
    { key: 'freespins.bg',                    label: 'Background (in-round)',  requirement: 'optional',
      description: 'Substituted for the base-game background during free spins' },
    { key: 'freespins.spin_counter_frame',    label: 'Spin counter frame',     requirement: 'required',
      description: 'Overlay showing "5 / 10 spins left"' },
    { key: 'freespins.multiplier_badge',      label: 'Multiplier badge',       requirement: 'conditional',
      isApplicable: s => s.multiplierMode !== 'none',
      description: 'Shown when a multiplier mode is enabled' },
    { key: 'freespins.retrigger_celebration', label: 'Retrigger celebration',  requirement: 'conditional',
      isApplicable: s => s.retriggerEnabled,
      description: 'Brief overlay when more triggers land mid-round' },
    { key: 'freespins.outro_banner',          label: 'Outro banner',           requirement: 'required',
      description: '"Total win: X" end screen' },
  ],
  screens: ['Free Spins (intro)', 'Free Spins (in-round)'],
}

// ─── 2. Buy Feature ──────────────────────────────────────────────────────────

const BuyFeatureSchema = z.object({
  enabled:          z.boolean().default(false),
  targetFeature:    z.enum(['freespin', 'bonus_pick', 'holdnspin']).default('freespin'),
  costMultiplier:   z.number().int().min(50).max(500).default(100),
  confirmRequired:  z.boolean().default(true),
  regulatoryGate:   z.enum(['none', 'uk_disabled', 'de_disabled']).default('none'),
})
type BuyFeatureSettings = z.infer<typeof BuyFeatureSchema>

const buyFeature: FeatureDef<BuyFeatureSettings> = {
  id:          'buy_feature',
  label:       'Buy Feature',
  group:       'buy_ante',
  description: 'Player pays a fixed bet multiplier to skip the trigger and enter the bonus directly.',
  settingsSchema:  BuyFeatureSchema,
  defaultSettings: BuyFeatureSchema.parse({}),
  assetSlots: [
    { key: 'buy.button',             label: 'Buy button (idle)',           requirement: 'required',
      description: 'Shown next to the spin button in base game' },
    { key: 'buy.button_hover',       label: 'Buy button (hover)',          requirement: 'optional',
      description: 'Hover-state variant; falls back to a tinted idle button' },
    { key: 'buy.confirm_panel_bg',   label: 'Confirmation panel background', requirement: 'conditional',
      isApplicable: s => s.confirmRequired,
      description: 'Modal background; only when confirmation is required' },
    { key: 'buy.confirm_icon',       label: 'Confirmation icon',           requirement: 'conditional',
      isApplicable: s => s.confirmRequired,
      description: 'E.g. golden chest; only when confirmation is required' },
  ],
  screens: [],
}

// ─── 3. Bonus Pick ───────────────────────────────────────────────────────────

const BonusPickSchema = z.object({
  triggerSymbol:       z.enum(['bonus', 'scatter']).default('bonus'),
  triggerCount:        z.number().int().min(3).max(5).default(3),
  gridLayout:          z.enum(['3x4', '4x3', '4x4', '5x4']).default('4x3'),
  picksAllowed:        z.number().int().min(1).max(20).default(3),
  prizeDistribution:   z.enum(['random', 'weighted']).default('weighted'),
  prizeTypes:          z.array(z.enum(['coin', 'multiplier', 'freespin', 'jackpot'])).default(['coin', 'multiplier', 'freespin', 'jackpot']),
  endTriggerEnabled:   z.boolean().default(true),
  endTriggerProb:      z.number().min(0).max(1).default(0.05),
})
type BonusPickSettings = z.infer<typeof BonusPickSchema>

const bonusPick: FeatureDef<BonusPickSettings> = {
  id:          'bonus_pick',
  label:       'Bonus Pick',
  group:       'bonus',
  description: 'A pick-and-reveal mini-game triggered by N+ bonus symbols.',
  settingsSchema:  BonusPickSchema,
  defaultSettings: BonusPickSchema.parse({}),
  assetSlots: [
    { key: 'bonuspick.bg',                label: 'Background',              requirement: 'required' },
    { key: 'bonuspick.header',            label: '"Choose Your Prize" header', requirement: 'required' },
    { key: 'bonuspick.tile_closed',       label: 'Tile (closed)',           requirement: 'required' },
    { key: 'bonuspick.tile_revealed',     label: 'Tile (revealed)',         requirement: 'required' },
    { key: 'bonuspick.prize_coin',        label: 'Prize: coin icon',        requirement: 'conditional',
      isApplicable: s => s.prizeTypes.includes('coin') },
    { key: 'bonuspick.prize_multiplier',  label: 'Prize: multiplier icon',  requirement: 'conditional',
      isApplicable: s => s.prizeTypes.includes('multiplier') },
    { key: 'bonuspick.prize_freespin',    label: 'Prize: free-spin icon',   requirement: 'conditional',
      isApplicable: s => s.prizeTypes.includes('freespin') },
    { key: 'bonuspick.prize_jackpot',     label: 'Prize: jackpot icon',     requirement: 'conditional',
      isApplicable: s => s.prizeTypes.includes('jackpot') },
    { key: 'bonuspick.prize_pooper',      label: 'Prize: end-round icon',   requirement: 'conditional',
      isApplicable: s => s.endTriggerEnabled,
      description: 'A "POOPER" tile that ends the round early' },
    { key: 'bonuspick.footer',            label: '"Pick X of Y" footer',    requirement: 'required' },
  ],
  screens: ['Bonus Pick'],
}

// ─── 4. Hold & Spin (Lock & Win) ─────────────────────────────────────────────

const HoldAndSpinSchema = z.object({
  triggerSymbol:       z.string().default('coin'),
  triggerCount:        z.number().int().min(5).max(8).default(6),
  respinsGranted:      z.number().int().min(2).max(5).default(3),
  respinResetOnLand:   z.boolean().default(true),
  prizeOnSymbol:       z.enum(['value_text', 'value_image', 'value_animated']).default('value_text'),
  gridFillBonus:       z.number().int().min(0).default(0),
  jackpotTiers:        z.array(z.enum(['grand', 'major', 'minor', 'mini'])).default(['grand', 'major', 'minor', 'mini']),
  endCondition:        z.enum(['respins_zero', 'grid_full']).default('respins_zero'),
})
type HoldAndSpinSettings = z.infer<typeof HoldAndSpinSchema>

const holdAndSpin: FeatureDef<HoldAndSpinSettings> = {
  id:          'holdnspin',
  label:       'Hold & Spin',
  group:       'bonus',
  description: 'Special symbols lock in place; reels respin until no new symbol lands or grid fills.',
  settingsSchema:  HoldAndSpinSchema,
  defaultSettings: HoldAndSpinSchema.parse({}),
  assetSlots: [
    { key: 'holdnspin.intro_banner',          label: 'Intro banner',          requirement: 'required',
      description: '"Lock & Win!" pre-round screen' },
    { key: 'holdnspin.bg',                    label: 'Background',            requirement: 'optional' },
    { key: 'holdnspin.coin_symbol_locked',    label: 'Coin (locked state)',   requirement: 'required' },
    { key: 'holdnspin.coin_symbol_glowing',   label: 'Coin (just-landed glow)', requirement: 'optional' },
    { key: 'holdnspin.respin_counter_frame',  label: 'Respin counter frame',  requirement: 'required',
      description: 'Shows "3 spins left"' },
    { key: 'holdnspin.jackpot_grand',         label: 'Jackpot: Grand badge',  requirement: 'conditional',
      isApplicable: s => s.jackpotTiers.includes('grand') },
    { key: 'holdnspin.jackpot_major',         label: 'Jackpot: Major badge',  requirement: 'conditional',
      isApplicable: s => s.jackpotTiers.includes('major') },
    { key: 'holdnspin.jackpot_minor',         label: 'Jackpot: Minor badge',  requirement: 'conditional',
      isApplicable: s => s.jackpotTiers.includes('minor') },
    { key: 'holdnspin.jackpot_mini',          label: 'Jackpot: Mini badge',   requirement: 'conditional',
      isApplicable: s => s.jackpotTiers.includes('mini') },
    { key: 'holdnspin.outro_banner',          label: 'Outro banner',          requirement: 'required' },
  ],
  screens: ['Hold & Spin (intro)', 'Hold & Spin (in-round)'],
}

// ─── 5. Expanding Wild ───────────────────────────────────────────────────────

const ExpandingWildSchema = z.object({
  enabled:              z.boolean().default(false),
  appliesIn:            z.enum(['base', 'freespin', 'both']).default('freespin'),
  direction:            z.enum(['vertical', 'horizontal', 'both']).default('vertical'),
  triggerProbability:   z.number().min(0).max(1).default(1.0),
  hasMultiplier:        z.boolean().default(false),
  multiplierValue:      z.number().int().min(2).max(10).default(2),
  holdsPosition:        z.boolean().default(false),
})
type ExpandingWildSettings = z.infer<typeof ExpandingWildSchema>

const expandingWild: FeatureDef<ExpandingWildSettings> = {
  id:          'expanding_wild',
  label:       'Expanding Wild',
  group:       'wild',
  description: 'A wild symbol that expands to fill its entire reel column or row on landing.',
  settingsSchema:  ExpandingWildSchema,
  defaultSettings: ExpandingWildSchema.parse({}),
  assetSlots: [
    { key: 'expandwild.symbol',           label: 'Wild symbol (un-expanded)', requirement: 'required',
      description: 'The pre-expansion icon; replaces the base wild during this feature' },
    { key: 'expandwild.expanded_overlay', label: 'Expanded reel overlay',     requirement: 'required',
      description: 'Full-column (or row) graphic that overlays the reel post-expansion' },
    { key: 'expandwild.multiplier_badge', label: 'Multiplier badge',          requirement: 'conditional',
      isApplicable: s => s.hasMultiplier,
      description: 'Shown when a multiplier is configured' },
  ],
  screens: [],
}

// ─── Registry ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FEATURE_REGISTRY: Record<FeatureId, FeatureDef<any>> = {
  freespin:        freeSpins,
  buy_feature:     buyFeature,
  bonus_pick:      bonusPick,
  holdnspin:       holdAndSpin,
  expanding_wild:  expandingWild,
}

export const FEATURE_IDS = Object.keys(FEATURE_REGISTRY) as FeatureId[]

/** Get a feature definition by id, or null if unknown. */
export function getFeatureDef(id: string): FeatureDef | null {
  return (FEATURE_REGISTRY as Record<string, FeatureDef>)[id] ?? null
}
