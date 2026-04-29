// ─────────────────────────────────────────────────────────────────────────────
// Spinative — Editor PSD-key ↔ canonical AssetType alias map
//
// Why this exists
// ───────────────
// The legacy editor (public/editor/editor.js) speaks "PSD keys" — a flat
// schema dating from the standalone slotforge-html days:
//
//   bg, bg_bonus, char, reelFrame, spinBtn, jpGrand,
//   sym_H1..H8, sym_L1..L8, sym_Wild, sym_Scatter, sym_Special3..6
//
// Every newer surface (`generated_assets.type`, the Art workspace, the
// Marketing readiness probe, the AssetType union in `types/assets.ts`)
// speaks "canonical types":
//
//   background_base, background_bonus, character, reel_frame,
//   spin_button, jackpot_label, symbol_high_N, symbol_low_N,
//   symbol_wild, symbol_scatter, symbol_special_N
//
// `editor.js` already has SF_ASSET_KEY_MAP (canonical → PSD) for inbound
// drag-drop, but the OUTBOUND upload path (`SF_UPLOAD_ASSET` from a
// right-click upload) used the PSD key verbatim as `generated_assets.type`.
// Marketing's `loadMarketingAssets` and Art's grouping logic both filter on
// canonical types — so a Flow-side background upload landed in the DB as
// `type='bg'` and was invisible to every other workspace.
//
// This module exports the bidirectional map so:
//   1. `/api/assets/upload` normalises the incoming assetKey to the
//      canonical type before writing `generated_assets.type`.
//   2. Read paths (Marketing readiness probe, `getProjectAssets`) can
//      translate legacy rows on the fly so users who uploaded BEFORE the
//      fix don't have to re-upload anything.
//
// The map is intentionally one-way (PSD → canonical) — there's no
// well-defined inverse for `jackpot_label` (PSD has 4 tiers: jpGrand /
// jpMajor / jpMinor / jpMini, canonical has only one), so reversing it
// requires the caller's context. SF_ASSET_KEY_MAP in editor.js handles
// the canonical → PSD direction with the convention that jackpot_label
// lands in `jpGrand` by default.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetType } from '@/types/assets'

/** PSD key → canonical AssetType. Keys not in this map (feature-namespaced
 *  slots like `bonuspick.bg`, per-screen overrides like `bg_splash`,
 *  editor-only items like `bannerBet`) pass through unchanged — they're
 *  either already canonical or genuinely editor-internal. */
export const EDITOR_TO_CANONICAL: Readonly<Record<string, AssetType>> = Object.freeze({
  // Backgrounds
  bg:           'background_base',
  bg_bonus:     'background_bonus',
  // Hero figure + other singletons
  char:         'character',
  reelFrame:    'reel_frame',
  spinBtn:      'spin_button',
  // Jackpot — canonical AssetType has a single `jackpot_label`. The four
  // PSD tiers (jpGrand / jpMajor / jpMinor / jpMini) all reduce to it for
  // catalogue purposes; the editor still draws each tier from its own PSD
  // entry via payload.assets.jpGrand etc.
  jpGrand:      'jackpot_label',
  // High symbols
  sym_H1: 'symbol_high_1', sym_H2: 'symbol_high_2', sym_H3: 'symbol_high_3',
  sym_H4: 'symbol_high_4', sym_H5: 'symbol_high_5', sym_H6: 'symbol_high_6',
  sym_H7: 'symbol_high_7', sym_H8: 'symbol_high_8',
  // Low symbols
  sym_L1: 'symbol_low_1',  sym_L2: 'symbol_low_2',  sym_L3: 'symbol_low_3',
  sym_L4: 'symbol_low_4',  sym_L5: 'symbol_low_5',  sym_L6: 'symbol_low_6',
  sym_L7: 'symbol_low_7',  sym_L8: 'symbol_low_8',
  // Specials — first two named (Wild/Scatter), rest tiered
  sym_Wild:     'symbol_wild',
  sym_Scatter:  'symbol_scatter',
  sym_Special3: 'symbol_special_3',
  sym_Special4: 'symbol_special_4',
  sym_Special5: 'symbol_special_5',
  sym_Special6: 'symbol_special_6',
})

/** Set of canonical types — used to short-circuit the rename when the
 *  caller already passed a canonical key (idempotent normalisation). */
const CANONICAL_TYPES: ReadonlySet<string> = new Set(Object.values(EDITOR_TO_CANONICAL))

/** Translate an editor-side asset key into the canonical AssetType used
 *  by `generated_assets.type`. Pass-through for keys that are already
 *  canonical or that lie outside the alias domain (feature slots,
 *  editor-only chrome). */
export function normalizeAssetKey(key: string): string {
  if (!key) return key
  // Already canonical — short-circuit so we don't hit the map for the
  // common case (Art workspace uploads always pass canonical keys).
  if (CANONICAL_TYPES.has(key)) return key
  return EDITOR_TO_CANONICAL[key] ?? key
}

/** Inverse: which legacy PSD keys (if any) should be merged onto a given
 *  canonical type when reading from the DB? Used by the read-side fallback
 *  so users with stale `type='bg'` rows (uploaded before the fix landed)
 *  still see their assets in Marketing + Art without re-uploading.
 *
 *  Multiple PSD keys can collapse onto a single canonical (jpGrand →
 *  jackpot_label), so the return shape is a list. */
export function legacyKeysFor(canonical: string): readonly string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: string[] = []
  for (const [psd, canon] of Object.entries(EDITOR_TO_CANONICAL)) {
    if (canon === canonical) out.push(psd)
  }
  return out
}

/** All known legacy keys (flat array). Used by the readiness probe to
 *  widen its `WHERE type IN (…)` filter and pick up legacy rows. */
export const ALL_LEGACY_KEYS: readonly string[] = Object.freeze(Object.keys(EDITOR_TO_CANONICAL))
