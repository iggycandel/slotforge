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
  screens: ['Free Spins · Intro', 'Free Spins · In-round', 'Free Spins · Outro'],
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
  screens: ['Bonus Pick · Intro', 'Bonus Pick · Pick', 'Bonus Pick · Outro'],
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
  screens: ['Hold & Spin · Intro', 'Hold & Spin · In-round', 'Hold & Spin · Outro'],
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

// ─── 6. Win Sequence (Big / Mega / Epic Win) ────────────────────────────────
// Not opt-in — every slot game has a Big/Mega/Epic win celebration when the
// total win crosses one of the tier thresholds. Tier-specific art slots let
// designers upload unique title art per tier; everything else shares one
// asset (bg, frame, coins fx, collect button) so they read as one sequence.

const WinSequenceSchema = z.object({
  bigThresholdX:   z.number().int().min(5).max(50).default(15),    // total win in bet multiples
  megaThresholdX:  z.number().int().min(25).max(150).default(50),
  epicThresholdX:  z.number().int().min(75).max(500).default(150),
  durationMs:      z.number().int().min(800).max(10000).default(2500),
  skipOnClick:     z.boolean().default(true),
})
type WinSequenceSettings = z.infer<typeof WinSequenceSchema>

const winSequence: FeatureDef<WinSequenceSettings> = {
  id:          'win_sequence',
  label:       'Win Sequence',
  // No perfect group — reuse 'bonus' so it lands alongside FS / HnS / BP in
  // the Features workspace. The Features panel card treats it as always-on
  // so there's no enable toggle.
  group:       'bonus',
  description: 'Tiered win celebration: Big Win / Mega Win / Epic Win popups driven by total-win bet multiples.',
  settingsSchema:  WinSequenceSchema,
  defaultSettings: WinSequenceSchema.parse({}),
  assetSlots: [
    { key: 'winsequence.bg',                  label: 'Popup background',         requirement: 'optional',
      description: 'Full-viewport art behind the dim overlay — fireworks / confetti backdrops work well.' },
    { key: 'winsequence.frame',               label: 'Frame',                    requirement: 'optional',
      description: 'Decorative frame around the win amount (gold border, plaque, ribbon, etc.)' },
    { key: 'winsequence.bigwin_title_art',    label: 'Big Win title art',        requirement: 'optional',
      description: 'Overrides the CSS "BIG WIN" text when uploaded.' },
    { key: 'winsequence.megawin_title_art',   label: 'Mega Win title art',       requirement: 'optional',
      description: 'Overrides the CSS "MEGA WIN!" text when uploaded.' },
    { key: 'winsequence.epicwin_title_art',   label: 'Epic Win title art',       requirement: 'optional',
      description: 'Overrides the CSS "EPIC WIN!" text when uploaded.' },
    { key: 'winsequence.coins_fx',            label: 'Celebration overlay',      requirement: 'optional',
      description: 'Coins / sparks / particle burst — rendered above the frame.' },
    { key: 'winsequence.button_collect',      label: 'Collect button',           requirement: 'optional',
      description: 'Overrides the default CSS COLLECT button.' },
  ],
  screens: ['Big Win', 'Mega Win', 'Epic Win'],
}

// ─── 7. Wheel Bonus ─────────────────────────────────────────────────────────
// Spin-the-wheel bonus: a large disc divided into segments, each awarding a
// prize when the pointer lands on it. Art is composed of a shared disc body,
// a pointer, a hub centre piece, and per-segment decoration/prize icons.

const WheelBonusSchema = z.object({
  triggerSymbol:    z.enum(['scatter', 'bonus']).default('bonus'),
  triggerCount:     z.number().int().min(3).max(5).default(3),
  segments:         z.number().int().min(6).max(16).default(8),
  spinsAwarded:     z.number().int().min(1).max(5).default(1),
  prizeTypes:       z.array(z.enum(['coin', 'multiplier', 'freespin', 'jackpot', 'bonus'])).default(['coin', 'multiplier', 'freespin', 'jackpot']),
  allowRespin:      z.boolean().default(false),
})
type WheelBonusSettings = z.infer<typeof WheelBonusSchema>

const wheelBonus: FeatureDef<WheelBonusSettings> = {
  id:          'wheel_bonus',
  label:       'Wheel Bonus',
  group:       'bonus',
  description: 'Spin-the-wheel bonus awarding prizes, multipliers or feature entries per segment.',
  settingsSchema:  WheelBonusSchema,
  defaultSettings: WheelBonusSchema.parse({}),
  assetSlots: [
    { key: 'wheel.bg',              label: 'Background',           requirement: 'required' },
    { key: 'wheel.header',          label: '"Spin the Wheel" header', requirement: 'optional' },
    { key: 'wheel.disc',            label: 'Wheel disc',           requirement: 'required',
      description: 'The wheel body with segment divisions. Single image; pointer + hub overlay on top.' },
    { key: 'wheel.pointer',         label: 'Pointer / indicator',  requirement: 'required' },
    { key: 'wheel.hub',             label: 'Centre hub',           requirement: 'optional' },
    { key: 'wheel.segment_bg',      label: 'Segment decoration',   requirement: 'optional',
      description: 'Optional art overlaid on each segment (e.g. glow, starburst).' },
    { key: 'wheel.button_spin',     label: 'Spin button',          requirement: 'required' },
    { key: 'wheel.footer',          label: '"Prize awarded" footer', requirement: 'optional' },
  ],
  screens: ['Wheel Bonus · Intro', 'Wheel Bonus · Spin', 'Wheel Bonus · Outro'],
}

// ─── 8. Ladder / Trail Bonus ─────────────────────────────────────────────────
// Climb-a-ladder bonus: player chooses to collect the current step's prize
// or continue climbing for a bigger prize (with risk of losing it all).

const LadderBonusSchema = z.object({
  triggerSymbol:    z.enum(['scatter', 'bonus']).default('bonus'),
  triggerCount:     z.number().int().min(3).max(5).default(3),
  steps:            z.number().int().min(4).max(12).default(8),
  collectAvailable: z.boolean().default(true),
  climbOdds:        z.number().min(0).max(1).default(0.6),
})
type LadderBonusSettings = z.infer<typeof LadderBonusSchema>

const ladderBonus: FeatureDef<LadderBonusSettings> = {
  id:          'ladder_bonus',
  label:       'Ladder Bonus',
  group:       'bonus',
  description: 'Player climbs a ladder collecting prizes at each step; may cash out early or risk a step for a bigger prize.',
  settingsSchema:  LadderBonusSchema,
  defaultSettings: LadderBonusSchema.parse({}),
  assetSlots: [
    { key: 'ladder.bg',             label: 'Background',           requirement: 'required' },
    { key: 'ladder.header',         label: 'Header art',           requirement: 'optional' },
    { key: 'ladder.rail',           label: 'Ladder rail',          requirement: 'required',
      description: 'Vertical ladder / trail art that the steps attach to.' },
    { key: 'ladder.step',           label: 'Step tile',            requirement: 'required',
      description: 'Single step tile — rendered once per ladder step at computed positions.' },
    { key: 'ladder.step_active',    label: 'Step (current)',       requirement: 'optional',
      description: 'Highlighted variant used for the player\'s current position.' },
    { key: 'ladder.player_marker',  label: 'Player marker',        requirement: 'optional' },
    { key: 'ladder.button_climb',   label: 'Climb button',         requirement: 'required' },
    { key: 'ladder.button_collect', label: 'Collect button',       requirement: 'conditional',
      isApplicable: s => s.collectAvailable },
    { key: 'ladder.footer',         label: 'Prize label / footer', requirement: 'optional' },
  ],
  screens: ['Ladder Bonus · Intro', 'Ladder Bonus · Climb', 'Ladder Bonus · Outro'],
}

// ─── 9. Gamble (classic double-or-nothing) ──────────────────────────────────
// Post-win gamble — player bets the current win on a card/coin/colour pick.
// Correct guess doubles the prize; wrong guess loses it. Rounds continue
// until the player collects or a ceiling is hit.

const GambleSchema = z.object({
  maxRounds:        z.number().int().min(1).max(10).default(5),
  gambleType:       z.enum(['card_color', 'card_suit', 'coin', 'number']).default('card_color'),
  winChance:        z.number().min(0.05).max(0.95).default(0.5),
  minWinToGamble:   z.number().min(0).default(0),
})
type GambleSettings = z.infer<typeof GambleSchema>

const gamble: FeatureDef<GambleSettings> = {
  id:          'gamble',
  label:       'Gamble',
  group:       'gamble',
  description: 'Post-win double-or-nothing on a card, coin or colour pick. Each correct guess doubles the prize.',
  settingsSchema:  GambleSchema,
  defaultSettings: GambleSchema.parse({}),
  assetSlots: [
    { key: 'gamble.bg',               label: 'Background',          requirement: 'required' },
    { key: 'gamble.header',           label: '"Gamble?" header',    requirement: 'optional' },
    { key: 'gamble.pick_element',     label: 'Pick element',        requirement: 'required',
      description: 'The card / coin / wheel the player picks (rendered centered).' },
    { key: 'gamble.option_a',         label: 'Option A art',        requirement: 'required',
      description: 'e.g. Red / Heads / Hearts — left pick button.' },
    { key: 'gamble.option_b',         label: 'Option B art',        requirement: 'required',
      description: 'e.g. Black / Tails / Spades — right pick button.' },
    { key: 'gamble.button_collect',   label: 'Collect button',      requirement: 'required' },
    { key: 'gamble.meter',            label: 'Round meter',         requirement: 'optional',
      description: 'Shows "Round X of Y" above or beside the pick element.' },
    { key: 'gamble.footer',           label: 'Prize / status bar',  requirement: 'optional' },
  ],
  screens: ['Gamble · Intro', 'Gamble · Pick', 'Gamble · Outro'],
}

// ─── 10. Super Gamble (extended ladder) ────────────────────────────────────
// Steps are typed (some safer, some risky) and capped at a configurable
// maximum — the player can choose how far to climb before collecting.

const SuperGambleSchema = z.object({
  maxSteps:         z.number().int().min(3).max(10).default(5),
  baseMultiplier:   z.number().min(1.5).max(5).default(2),
  bustProbability:  z.number().min(0).max(0.5).default(0.1),
  collectEveryStep: z.boolean().default(true),
})
type SuperGambleSettings = z.infer<typeof SuperGambleSchema>

const superGamble: FeatureDef<SuperGambleSettings> = {
  id:          'super_gamble',
  label:       'Super Gamble',
  group:       'gamble',
  description: 'Extended gamble ladder with multiple steps up to a capped maximum — risk the prize for a bigger multiplier.',
  settingsSchema:  SuperGambleSchema,
  defaultSettings: SuperGambleSchema.parse({}),
  assetSlots: [
    { key: 'supergamble.bg',            label: 'Background',        requirement: 'required' },
    { key: 'supergamble.header',        label: 'Header art',        requirement: 'optional' },
    { key: 'supergamble.step',          label: 'Ladder step tile',  requirement: 'required',
      description: 'Shared tile rendered once per step. Multiplier value is a CSS overlay on top.' },
    { key: 'supergamble.step_active',   label: 'Step (current)',    requirement: 'optional' },
    { key: 'supergamble.meter',         label: 'Multiplier meter',  requirement: 'optional',
      description: 'Ornamental frame that wraps the current prize total.' },
    { key: 'supergamble.button_collect',label: 'Collect button',    requirement: 'required' },
    { key: 'supergamble.button_gamble', label: 'Gamble button',     requirement: 'required' },
    { key: 'supergamble.footer',        label: 'Prize / status bar',requirement: 'optional' },
  ],
  screens: ['Super Gamble · Intro', 'Super Gamble · Ladder', 'Super Gamble · Outro'],
}

// ─── Registry ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FEATURE_REGISTRY: Record<FeatureId, FeatureDef<any>> = {
  freespin:        freeSpins,
  buy_feature:     buyFeature,
  bonus_pick:      bonusPick,
  holdnspin:       holdAndSpin,
  expanding_wild:  expandingWild,
  win_sequence:    winSequence,
  wheel_bonus:     wheelBonus,
  ladder_bonus:    ladderBonus,
  gamble:          gamble,
  super_gamble:    superGamble,
}

export const FEATURE_IDS = Object.keys(FEATURE_REGISTRY) as FeatureId[]

/** Get a feature definition by id, or null if unknown. */
export function getFeatureDef(id: string): FeatureDef | null {
  return (FEATURE_REGISTRY as Record<string, FeatureDef>)[id] ?? null
}
