// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Feature registry types
//
// Single source of truth for what each feature is, what settings it accepts,
// and what asset slots it requires. Consumed by:
//   - Features panel form (settingsSchema → Zod-validated form)
//   - Features panel "needed assets" list (activeAssetSlots(featureId, settings))
//   - Assets workspace per-feature rows (same)
//   - Canvas overlay composition (screens + active asset slot URLs)
//   - Spin simulation (sim hook, added in Phase 5)
//
// This file defines TYPES only. Actual feature definitions live in
// lib/features/registry.ts. Keeping them split lets non-React code
// (e.g. server actions) import the types without pulling Zod-runtime in
// where it's not needed.
//
// See docs/features-v1-catalogue.md for the per-feature spec.
// ─────────────────────────────────────────────────────────────────────────────

import type { z } from 'zod'

// ─── Feature ids (must match keys used in editor.js FDEFS) ──────────────────

export type FeatureId =
  | 'freespin'        // Free Spins
  | 'buy_feature'     // Buy Feature
  | 'bonus_pick'      // Bonus Pick Game
  | 'holdnspin'       // Hold & Spin / Lock & Win
  | 'expanding_wild'  // Expanding Wild
  | 'win_sequence'    // Big / Mega / Epic Win popup sequence
  | 'wheel_bonus'     // Spin-the-wheel bonus
  | 'ladder_bonus'    // Ladder / Trail climbing bonus
  | 'gamble'          // Post-win double-or-nothing
  | 'super_gamble'    // Extended gamble ladder
  // ─ Tier B: reel-area decoration overlays (no intro/outro) ─
  | 'sticky_wild'     // Wilds stay put across respins
  | 'walking_wild'    // Wild shifts one reel per spin
  | 'cascade'         // Cascade / avalanche FX
  | 'tumble'          // Tumble / falling-symbol FX
  | 'win_multiplier'  // Counter frame on top of reels
  | 'cluster_pays'    // Cluster highlight overlay
  | 'infinity_reels'  // Extra-reel slice art

export type FeatureGroup =
  | 'bonus'      // Bonus Rounds
  | 'wild'       // Wild Mechanics
  | 'buy_ante'   // Buy / Ante
  | 'cascade'    // Cascades & Reactions
  | 'special'    // Special Mechanics
  | 'gamble'     // Gamble

// ─── Asset slot ──────────────────────────────────────────────────────────────

export type AssetSlotRequirement = 'required' | 'optional' | 'conditional'

export interface AssetSlot<S = unknown> {
  /** Namespaced key, e.g. 'bonuspick.tile_closed'. Stable — used as the
   *  payload.assets[key] index and the storage path. */
  key: string

  /** Short label shown in Assets workspace + Features panel. */
  label: string

  /**
   * required:    must be uploaded for the feature to render correctly
   * optional:    nice-to-have; falls back to a base-game asset or default
   * conditional: only shown when isApplicable(settings) returns true
   */
  requirement: AssetSlotRequirement

  /** Predicate over current settings — only consulted when requirement === 'conditional'. */
  isApplicable?: (settings: S) => boolean

  /** One-line description of where this asset appears (for tooltip/help). */
  description?: string
}

// ─── Feature definition ──────────────────────────────────────────────────────

export interface FeatureDef<S = unknown> {
  id:           FeatureId
  label:        string
  group:        FeatureGroup
  description:  string

  /** Zod schema for the settings object — drives the Features panel form
   *  and validates payload reads. */
  settingsSchema:  z.ZodType<S>

  /** Settings used when the feature is first enabled. Must satisfy schema. */
  defaultSettings: S

  /** All possible asset slots. Use activeAssetSlots() to get the subset
   *  that applies to current settings. */
  assetSlots:      AssetSlot<S>[]

  /** Canvas screen tab labels this feature contributes when enabled.
   *  Empty array means the feature only mutates the base game (e.g. Buy Feature
   *  adds a button, Expanding Wild changes the wild's behaviour). */
  screens:         string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the asset slots that actually apply for a given settings value. */
export function activeAssetSlots<S>(def: FeatureDef<S>, settings: S): AssetSlot<S>[] {
  return def.assetSlots.filter(slot => {
    if (slot.requirement !== 'conditional') return true
    return slot.isApplicable?.(settings) ?? false
  })
}
